import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, FeatureDisabledError, NotFoundError, ValidationError } from "../../utils/errors";
import { createEntityId } from "../../utils/ids";
import * as settingsRepository from "./settings.repository";
import type {
  ApprovalThresholdFilters,
  ApprovalThresholdRecord,
  BulkUpdateFeaturesInput,
  CompanySettingRecord,
  FeatureSettingRecord,
  SettingsChangeLogFilters,
  SettingsGroup,
  UpdateApprovalSettingsInput,
  UpdateApprovalThresholdInput,
  UpdateFeatureInput,
  UpdateSettingsGroupInput,
} from "./settings.types";
import {
  validateFeatureDependencies,
} from "./settings.validators";

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseJsonArray = (value: string | null | undefined): string[] | null =>
  parseJson<string[] | null>(value, null);

const groupStorageName = (group: SettingsGroup): string => {
  const aliases: Partial<Record<SettingsGroup, string>> = {
    ui_preferences: "ui",
    offline_sync: "sync",
    backup_recovery: "backup",
    audit_security: "security",
    approval_workflows: "approvals",
    payroll_earnings: "payroll",
    realtime_websocket: "realtime",
    import_export: "import_export",
  };

  return aliases[group] ?? group;
};

const toSettingData = (setting: CompanySettingRecord) => ({
  ...setting,
  value: parseJson<Record<string, unknown>>(setting.setting_value_json, {}),
  setting_value_json: undefined,
});

const auditSettingsChange = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    oldValueJson?: string | null;
    newValueJson?: string | null;
    reason: string;
    effectiveDate?: string;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "settings",
    action: input.action,
    severity: "info",
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValueJson ?? undefined,
    newValueJson: input.newValueJson ?? undefined,
    reason: input.reason,
    effectiveDate: input.effectiveDate,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!result.created) {
    throw new AppError(
      "Settings audit log could not be recorded. Please try again.",
      "SERVER_ERROR",
      500,
    );
  }
};

const broadcastSettingsEvent = async (
  env: Env,
  context: AuthActor,
  type: string,
  payload: Record<string, unknown>,
) => {
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type,
    payload,
    triggeredBy: context.actorUserId,
  }).catch((error) => {
    console.error("Settings realtime event failed", {
      type,
      error,
    });
  });
};

const getEnabledFeatureSet = (features: FeatureSettingRecord[]): Set<string> =>
  new Set(
    features
      .filter(
        (feature) =>
          feature.is_enabled === 1 &&
          ["active", "enabled"].includes(feature.status),
      )
      .map((feature) => feature.feature_key),
  );

const featureRequiresEffectiveDate = (feature: FeatureSettingRecord): boolean =>
  feature.affects_payroll === 1 ||
  feature.affects_attendance === 1 ||
  feature.affects_leave === 1 ||
  feature.affects_roster === 1;

const featureAction = (
  existing: FeatureSettingRecord,
  input: UpdateFeatureInput,
): string => {
  if (input.is_enabled === true && existing.is_enabled !== 1) {
    return "feature_enabled";
  }

  if (input.is_enabled === false && existing.is_enabled === 1) {
    return "feature_disabled";
  }

  return "feature_updated";
};

export const getAllSettings = async (env: Env, context: AuthActor) => ({
  settings: (await settingsRepository.listSettings(env, context.companyId)).map(
    toSettingData,
  ),
});

export const getSettingsGroup = async (
  env: Env,
  context: AuthActor,
  group: SettingsGroup,
) => {
  const settings = await settingsRepository.getSettingsGroup(
    env,
    context.companyId,
    groupStorageName(group),
  );

  return {
    group,
    settings: settings.map(toSettingData),
  };
};

export const updateSettingsGroup = async (
  env: Env,
  context: AuthActor,
  group: SettingsGroup,
  input: UpdateSettingsGroupInput,
) => {
  const storageGroup = groupStorageName(group);
  const updated: string[] = [];

  for (const [settingKey, value] of Object.entries(input.settings)) {
    const existing = await settingsRepository.getSetting(
      env,
      context.companyId,
      settingKey,
    );
    const newValueJson = JSON.stringify(value);

    await settingsRepository.upsertSetting(env, {
      id: existing?.id ?? createEntityId("id").replace("id_", "setting_"),
      companyId: context.companyId,
      settingKey,
      settingGroup: storageGroup,
      valueJson: newValueJson,
      effectiveFrom: input.effective_date,
      actorUserId: context.actorUserId,
    });
    await settingsRepository.createSettingsChangeLog(env, {
      id: createEntityId("audit").replace("audit_", "settings_log_"),
      companyId: context.companyId,
      settingGroup: storageGroup,
      settingKey,
      oldValueJson: existing?.setting_value_json ?? null,
      newValueJson,
      changedBy: context.actorUserId,
      reason: input.reason,
      effectiveDate: input.effective_date,
      version: Date.now(),
    });

    await auditSettingsChange(env, context, {
      action:
        group === "payroll"
          ? "payroll_settings_updated"
          : group === "leave"
            ? "leave_settings_updated"
            : group === "long_leave"
              ? "long_leave_settings_updated"
              : group === "holidays"
                ? "holiday_settings_updated"
                : group === "attendance"
                  ? "attendance_settings_updated"
                  : group === "offline_sync"
                    ? "sync_settings_updated"
                    : group === "ui_preferences"
                      ? "ui_preferences_updated"
                      : group === "my_profile"
                        ? "my_profile_settings_updated"
                        : "settings_group_updated",
      entityType: "company_setting",
      entityId: settingKey,
      oldValueJson: existing?.setting_value_json ?? null,
      newValueJson,
      reason: input.reason,
      effectiveDate: input.effective_date,
    });
    updated.push(settingKey);
  }

  await broadcastSettingsEvent(env, context, "settings.updated", {
    group,
    updated,
  });

  return {
    updated: true,
    group,
    settings: updated,
  };
};

export const listFeatures = async (env: Env, context: AuthActor) => ({
  features: await settingsRepository.listFeatureSettings(env, context.companyId),
});

export const getFeature = async (
  env: Env,
  context: AuthActor,
  featureKey: string,
) => {
  const feature = await settingsRepository.getFeatureSetting(
    env,
    context.companyId,
    featureKey,
  );

  if (!feature) {
    throw new NotFoundError("The requested feature setting could not be found.");
  }

  return feature;
};

export const updateFeature = async (
  env: Env,
  context: AuthActor,
  featureKey: string,
  input: UpdateFeatureInput,
) => {
  const existing = await getFeature(env, context, featureKey);

  if (
    env.ENVIRONMENT === "production" &&
    featureKey === "audit_logs" &&
    input.is_enabled === false
  ) {
    throw new FeatureDisabledError(
      "Audit logs cannot be disabled in production.",
    );
  }

  if (featureRequiresEffectiveDate(existing) && !input.effective_from) {
    throw new ValidationError(
      "This setting affects payroll. Please select an effective date.",
    );
  }

  const allFeatures = await settingsRepository.listFeatureSettings(
    env,
    context.companyId,
  );
  const enabledFeatures = getEnabledFeatureSet(allFeatures);

  if (input.is_enabled === true || input.status === "enabled" || input.status === "active") {
    enabledFeatures.add(featureKey);
    validateFeatureDependencies(featureKey, true, enabledFeatures);
  }

  await settingsRepository.updateFeatureSetting(env, {
    companyId: context.companyId,
    featureKey,
    isEnabled: input.is_enabled,
    status: input.status,
    appliesToAllOutlets: input.applies_to_all_outlets,
    allowedOutletIdsJson:
      input.allowed_outlet_ids_json === undefined
        ? existing.allowed_outlet_ids_json
        : input.allowed_outlet_ids_json
          ? JSON.stringify(input.allowed_outlet_ids_json)
          : null,
    allowedRoleIdsJson:
      input.allowed_role_ids_json === undefined
        ? existing.allowed_role_ids_json
        : input.allowed_role_ids_json
          ? JSON.stringify(input.allowed_role_ids_json)
          : null,
    effectiveFrom: input.effective_from,
  });

  const action = featureAction(existing, input);
  const newFeature = await getFeature(env, context, featureKey);
  const oldJson = JSON.stringify(existing);
  const newJson = JSON.stringify(newFeature);

  await settingsRepository.createSettingsChangeLog(env, {
    id: createEntityId("audit").replace("audit_", "settings_log_"),
    companyId: context.companyId,
    settingGroup: "features",
    settingKey: featureKey,
    oldValueJson: oldJson,
    newValueJson: newJson,
    changedBy: context.actorUserId,
    reason: input.reason,
    effectiveDate: input.effective_from,
    version: Date.now(),
  });
  await auditSettingsChange(env, context, {
    action,
    entityType: "feature_setting",
    entityId: featureKey,
    oldValueJson: oldJson,
    newValueJson: newJson,
    reason: input.reason,
    effectiveDate: input.effective_from,
  });
  await broadcastSettingsEvent(
    env,
    context,
    action === "feature_enabled"
      ? "settings.feature_enabled"
      : action === "feature_disabled"
        ? "settings.feature_disabled"
        : "settings.updated",
    { feature_key: featureKey },
  );

  return {
    updated: true,
    feature: newFeature,
  };
};

export const bulkUpdateFeatures = async (
  env: Env,
  context: AuthActor,
  input: BulkUpdateFeaturesInput,
) => {
  const updated: string[] = [];

  for (const [featureKey, featureInput] of Object.entries(input.features)) {
    await updateFeature(env, context, featureKey, {
      ...featureInput,
      reason: input.reason,
      effective_from: featureInput.effective_from ?? input.effective_from,
    });
    updated.push(featureKey);
  }

  return {
    updated: true,
    features: updated,
  };
};

export const getApprovalSettings = async (env: Env, context: AuthActor) => {
  const setting = await settingsRepository.getSetting(
    env,
    context.companyId,
    "approvals.default_rules",
  );

  return {
    setting_key: "approvals.default_rules",
    value: parseJson<Record<string, unknown>>(setting?.setting_value_json, {}),
  };
};

export const updateApprovalSettings = async (
  env: Env,
  context: AuthActor,
  input: UpdateApprovalSettingsInput,
) => {
  const current = await getApprovalSettings(env, context);
  const merged = {
    ...current.value,
    ...input,
  };

  delete (merged as Record<string, unknown>).reason;
  delete (merged as Record<string, unknown>).effective_date;

  const result = await updateSettingsGroup(env, context, "approval_workflows", {
    settings: {
      "approvals.default_rules": merged,
    },
    reason: input.reason,
    effective_date: input.effective_date,
  });

  await broadcastSettingsEvent(env, context, "approval.mode_changed", {
    approval_mode: input.approval_mode,
  });

  return result;
};

export const listApprovalThresholds = (
  env: Env,
  context: AuthActor,
  filters: ApprovalThresholdFilters,
) => settingsRepository.listApprovalThresholds(env, context.companyId, filters);

export const getApprovalThreshold = async (
  env: Env,
  context: AuthActor,
  id: string,
) => {
  const threshold = await settingsRepository.getApprovalThresholdById(
    env,
    context.companyId,
    id,
  );

  if (!threshold) {
    throw new NotFoundError("The requested approval threshold could not be found.");
  }

  return threshold;
};

export const updateApprovalThreshold = async (
  env: Env,
  context: AuthActor,
  thresholdId: string,
  input: UpdateApprovalThresholdInput,
) => {
  const existing = await getApprovalThreshold(env, context, thresholdId);
  const mergedInput: UpdateApprovalThresholdInput = {
    threshold_name: input.threshold_name ?? existing.threshold_name,
    threshold_type: input.threshold_type ?? existing.threshold_type,
    amount_min:
      input.amount_min !== undefined ? input.amount_min : existing.amount_min,
    amount_max:
      input.amount_max !== undefined ? input.amount_max : existing.amount_max,
    percentage_min:
      input.percentage_min !== undefined
        ? input.percentage_min
        : existing.percentage_min,
    percentage_max:
      input.percentage_max !== undefined
        ? input.percentage_max
        : existing.percentage_max,
    currency: input.currency ?? existing.currency ?? "MVR",
    required_roles_json:
      input.required_roles_json !== undefined
        ? input.required_roles_json
        : parseJsonArray(existing.required_roles_json),
    required_permissions_json:
      input.required_permissions_json !== undefined
        ? input.required_permissions_json
        : parseJsonArray(existing.required_permissions_json),
    is_active: input.is_active ?? existing.is_active === 1,
    effective_from: input.effective_from ?? existing.effective_from ?? undefined,
    reason: input.reason,
  };

  if (
    mergedInput.amount_min !== null &&
    mergedInput.amount_min !== undefined &&
    mergedInput.amount_max !== null &&
    mergedInput.amount_max !== undefined &&
    mergedInput.amount_min > mergedInput.amount_max
  ) {
    throw new ValidationError("Minimum amount cannot be greater than maximum amount.");
  }

  await settingsRepository.updateApprovalThreshold(
    env,
    context.companyId,
    thresholdId,
    mergedInput,
  );
  const updated = await getApprovalThreshold(env, context, thresholdId);
  const oldJson = JSON.stringify(existing);
  const newJson = JSON.stringify(updated);

  await settingsRepository.createApprovalThresholdHistory(env, {
    id: createEntityId("audit").replace("audit_", "threshold_history_"),
    companyId: context.companyId,
    thresholdId,
    oldValueJson: oldJson,
    newValueJson: newJson,
    changedBy: context.actorUserId,
    changeReason: mergedInput.reason,
    effectiveFrom: mergedInput.effective_from,
  });
  await auditSettingsChange(env, context, {
    action: "approval_threshold_updated",
    entityType: "approval_threshold",
    entityId: thresholdId,
    oldValueJson: oldJson,
    newValueJson: newJson,
    reason: mergedInput.reason,
    effectiveDate: mergedInput.effective_from,
  });
  await broadcastSettingsEvent(env, context, "approval.threshold_updated", {
    threshold_id: thresholdId,
  });

  return {
    updated: true,
    threshold: updated,
  };
};

export const getSettingsChangeLog = (
  env: Env,
  context: AuthActor,
  filters: SettingsChangeLogFilters,
) => settingsRepository.listSettingsChangeLog(env, context.companyId, filters);

export const getDefaultUiPreferences = () => ({
  layout_style: "professional_list",
  avoid_bubble_card_heavy_ui: true,
  use_compact_tables: true,
  show_row_action_icons: true,
  collapsible_sidebar: true,
  sidebar_default_state: "expanded",
  remember_sidebar_state: true,
  mobile_sidebar_mode: "drawer",
  show_tooltips_when_sidebar_collapsed: true,
});

export type { ApprovalThresholdRecord };
