import { z } from "zod";

import {
  ALLOWED_SETTINGS_GROUPS,
  APPROVAL_MODES,
  FEATURE_DEPENDENCIES,
  FEATURE_DEPENDENCY_LABELS,
  PAYROLL_IMPACTING_GROUPS,
  REPORTABLE_FEATURES,
  SENSITIVE_SETTING_GROUPS,
} from "./settings.constants";
import type {
  ApprovalThresholdFilters,
  BulkUpdateFeaturesInput,
  SettingsChangeLogFilters,
  SettingsGroup,
  UpdateApprovalSettingsInput,
  UpdateApprovalThresholdInput,
  UpdateFeatureInput,
  UpdateSettingsGroupInput,
} from "./settings.types";
import { AppError, ValidationError } from "../../utils/errors";

export class FeatureDependencyError extends AppError {
  constructor(message: string) {
    super(message, "FEATURE_DEPENDENCY_REQUIRED", 400);
  }
}

const reasonSchema = z
  .string({
    required_error: "A reason is required for this settings change.",
  })
  .trim()
  .min(3, "A reason is required for this settings change.");

const effectiveDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a valid effective date.")
  .optional();

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message);
  }

  return result.data;
};

export const validateSettingsGroup = (group: string): SettingsGroup => {
  if (!ALLOWED_SETTINGS_GROUPS.includes(group as SettingsGroup)) {
    throw new ValidationError("Please choose a valid settings group.");
  }

  return group as SettingsGroup;
};

const requireEffectiveDateForPayrollImpact = (
  group: string,
  effectiveDate?: string,
) => {
  if (PAYROLL_IMPACTING_GROUPS.has(group) && !effectiveDate) {
    throw new ValidationError(
      "This setting affects payroll. Please select an effective date.",
    );
  }
};

export const validateUpdateSettingsGroupInput = (
  group: SettingsGroup,
  payload: unknown,
): UpdateSettingsGroupInput => {
  const parsed = parse(
    z.object({
      settings: z.record(
        z.string().min(1),
        z.record(z.string(), z.unknown()),
      ),
      reason: SENSITIVE_SETTING_GROUPS.has(group)
        ? reasonSchema
        : z.string().trim().optional().default("Settings updated"),
      effective_date: effectiveDateSchema,
    }),
    payload,
  );
  const input: UpdateSettingsGroupInput = {
    ...parsed,
    reason: parsed.reason ?? "Settings updated",
  };

  requireEffectiveDateForPayrollImpact(group, input.effective_date);
  validateUiPreferences(input.settings);

  return input;
};

const featureKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]+$/, "Please choose a valid feature key.");

const featureUpdateSchema = z.object({
  is_enabled: z.boolean().optional(),
  status: z.enum(["enabled", "disabled", "active", "inactive"]).optional(),
  applies_to_all_outlets: z.boolean().optional(),
  allowed_outlet_ids_json: z.array(z.string().min(1)).nullable().optional(),
  allowed_role_ids_json: z.array(z.string().min(1)).nullable().optional(),
  effective_from: effectiveDateSchema,
});

export const validateFeatureKey = (featureKey: string): string =>
  parse(featureKeySchema, featureKey);

export const validateUpdateFeatureInput = (payload: unknown): UpdateFeatureInput => {
  const input = parse(
    featureUpdateSchema.extend({
      reason: reasonSchema,
    }),
    payload,
  );

  if (
    requiresFeatureEffectiveDate(input) &&
    !input.effective_from
  ) {
    throw new ValidationError(
      "This setting affects payroll. Please select an effective date.",
    );
  }

  return input;
};

export const validateBulkUpdateFeaturesInput = (
  payload: unknown,
): BulkUpdateFeaturesInput =>
  parse(
    z.object({
      features: z.record(featureKeySchema, featureUpdateSchema),
      reason: reasonSchema,
      effective_from: effectiveDateSchema,
    }),
    payload,
  );

export const validateApprovalSettingsInput = (
  payload: unknown,
): UpdateApprovalSettingsInput =>
  parse(
    z.object({
      approval_workflows_enabled: z.boolean().optional(),
      approval_mode: z.enum(APPROVAL_MODES).optional(),
      require_approval_if_only_admin_superadmin_exist: z.boolean().optional(),
      auto_approve_for_admin_superadmin: z.boolean().optional(),
      require_reason_when_approvals_disabled: z.boolean().optional(),
      audit_when_approvals_disabled: z.boolean().optional(),
      reason: reasonSchema,
      effective_date: effectiveDateSchema,
    }),
    payload,
  );

export const validateApprovalThresholdInput = (
  payload: unknown,
): UpdateApprovalThresholdInput => {
  const input = parse(
    z.object({
      threshold_name: z.string().trim().min(1).optional(),
      threshold_type: z.string().trim().min(1).optional(),
      amount_min: z.number().int().nullable().optional(),
      amount_max: z.number().int().nullable().optional(),
      percentage_min: z.number().nullable().optional(),
      percentage_max: z.number().nullable().optional(),
      currency: z.string().trim().min(1).optional(),
      required_roles_json: z.array(z.string().min(1)).nullable().optional(),
      required_permissions_json: z.array(z.string().min(1)).nullable().optional(),
      is_active: z.boolean().optional(),
      effective_from: effectiveDateSchema,
      reason: reasonSchema,
    }),
    payload,
  );

  if (
    input.amount_min !== undefined &&
    input.amount_max !== undefined &&
    input.amount_min !== null &&
    input.amount_max !== null &&
    input.amount_min > input.amount_max
  ) {
    throw new ValidationError("Minimum amount cannot be greater than maximum amount.");
  }

  return input;
};

export const validateChangeLogFilters = (
  query: Record<string, string | undefined>,
): SettingsChangeLogFilters =>
  parse(
    z.object({
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      setting_group: z.string().optional(),
      setting_key: z.string().optional(),
      changed_by: z.string().optional(),
      effective_date: z.string().optional(),
    }),
    query,
  );

export const validateApprovalThresholdFilters = (
  query: Record<string, string | undefined>,
): ApprovalThresholdFilters =>
  parse(
    z.object({
      workflow_key: z.string().optional(),
      threshold_type: z.string().optional(),
      is_active: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === "true")),
    }),
    query,
  );

export const validateFeatureDependencies = (
  featureKey: string,
  isEnabling: boolean,
  enabledFeatures: Set<string>,
) => {
  if (!isEnabling) {
    return;
  }

  if (featureKey === "reports") {
    const hasReportableFeature = REPORTABLE_FEATURES.some((key) =>
      enabledFeatures.has(key),
    );

    if (!hasReportableFeature) {
      throw new FeatureDependencyError(
        "Reports need at least one reportable module enabled first.",
      );
    }
  }

  const dependencies = FEATURE_DEPENDENCIES[featureKey] ?? [];
  const missingDependency = dependencies.find((dependency) => !enabledFeatures.has(dependency));

  if (missingDependency) {
    throw new FeatureDependencyError(
      `This feature cannot be enabled until ${FEATURE_DEPENDENCY_LABELS[missingDependency] ?? missingDependency} is enabled.`,
    );
  }
};

const requiresFeatureEffectiveDate = (input: Partial<UpdateFeatureInput>): boolean =>
  input.effective_from !== undefined ? false : false;

const validateUiPreferences = (settings: Record<string, Record<string, unknown>>) => {
  const preferences = settings["ui.preferences"];

  if (!preferences) {
    return;
  }

  if (
    preferences.layout_style !== undefined &&
    preferences.layout_style !== "professional_list"
  ) {
    throw new ValidationError(
      "Layout style must use the professional list layout.",
    );
  }

  if (
    preferences.sidebar_default_state !== undefined &&
    !["expanded", "collapsed"].includes(String(preferences.sidebar_default_state))
  ) {
    throw new ValidationError("Sidebar default state is not valid.");
  }

  if (
    preferences.mobile_sidebar_mode !== undefined &&
    !["drawer"].includes(String(preferences.mobile_sidebar_mode))
  ) {
    throw new ValidationError("Mobile sidebar mode is not valid.");
  }
};
