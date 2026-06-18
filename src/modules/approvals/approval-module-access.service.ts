import { resolveModuleFeatureAliases } from "../../config/module-codes";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { FeatureDisabledError } from "../../utils/errors";
import type { ApprovalOperationType, ApprovalRequestEngineRecord } from "./approval-workflow-engine.types";
import type { PayrollSubFeatureKey } from "../../middleware/feature.middleware";

export const APPROVAL_ACTIVE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "ESCALATED",
  "NEEDS_MANUAL_ASSIGNMENT",
  "PENDING",
  "IN_PROGRESS",
  "APPLYING",
  "FAILED",
] as const;

export const APPROVAL_OPERATION_MODULE_REQUIREMENTS: Record<string, {
  features?: string[];
  anyFeature?: string[];
  payrollSubFeatures?: string[];
  attendanceSubFeatures?: string[];
  message: string;
}> = {
  LEAVE_REQUEST: {
    features: ["leave_management"],
    message: "Leave Management is disabled. Enable it to continue leave approval workflows.",
  },
  ATTENDANCE_CORRECTION: {
    features: ["attendance"],
    attendanceSubFeatures: ["corrections_enabled"],
    message: "Attendance Corrections are disabled. Enable Attendance Management and Attendance Corrections to continue this workflow.",
  },
  ROSTER_CHANGE: {
    features: ["roster"],
    message: "Duty Roster is disabled. Enable it to continue roster approval workflows.",
  },
  PAYROLL_ADJUSTMENT: {
    features: ["payroll"],
    payrollSubFeatures: ["manual_deductions_enabled", "approvals_enabled"],
    message: "Payroll manual deductions or payroll approvals are disabled. Enable them to continue payroll adjustment approvals.",
  },
  PAYROLL_APPROVAL: {
    features: ["payroll"],
    payrollSubFeatures: ["approvals_enabled"],
    message: "Payroll approvals are disabled. Enable Payroll Management and Payroll Approvals to continue this workflow.",
  },
  ADVANCE_SALARY_REQUEST: {
    features: ["payroll"],
    payrollSubFeatures: ["advances_enabled"],
    message: "Advance Salary is disabled. Enable it in Payroll Settings to continue advance approvals.",
  },
  SALARY_LOAN_REQUEST: {
    features: ["payroll"],
    payrollSubFeatures: ["salary_loans_enabled"],
    message: "Salary Loans are disabled. Enable them in Payroll Settings to continue salary loan approvals.",
  },
  LONG_LEAVE_REQUEST: {
    features: ["long_leave_management"],
    message: "Long Leave Management is disabled. Enable it to continue long leave approval workflows.",
  },
  ADVANCE_PAYMENT: {
    features: ["payroll"],
    payrollSubFeatures: ["advances_enabled"],
    message: "Advance Salary is disabled. Enable it in Payroll Settings to continue advance payment approvals.",
  },
  DOCUMENT_KYC_UPDATE: {
    anyFeature: ["document_tracking", "documents_kyc"],
    message: "Document Tracking is disabled. Enable it to continue Document/KYC approvals.",
  },
  DOCUMENT_APPROVAL: {
    anyFeature: ["document_tracking", "documents_kyc"],
    message: "Document Tracking is disabled. Enable it to continue document approval workflows.",
  },
  EMPLOYEE_DOCUMENT_UPDATE: {
    features: ["employee_management"],
    message: "Employee Management is disabled. Enable it to continue employee document update approvals.",
  },
  EMPLOYEE_TRANSFER: {
    features: ["employee_management", "employee_structure_changes"],
    message: "Employee Structure Changes are disabled. Enable them to continue structure approval workflows.",
  },
  EMPLOYEE_STRUCTURE_CHANGE: {
    features: ["employee_management", "employee_structure_changes"],
    message: "Employee Structure Changes are disabled. Enable them to continue structure approval workflows.",
  },
  RESIGNATION: {
    features: ["resignation_offboarding"],
    message: "Resignation & Offboarding is disabled. Enable it to continue lifecycle approval workflows.",
  },
  OFFBOARDING: {
    features: ["resignation_offboarding"],
    message: "Resignation & Offboarding is disabled. Enable it to continue offboarding approval workflows.",
  },
  DISCIPLINARY_ACTION: {
    features: ["disciplinary_actions"],
    message: "Disciplinary Actions is disabled. Enable it to continue disciplinary approval workflows.",
  },
  CONTRACT_RENEWAL: {
    features: ["contract_tracking"],
    message: "Contract Tracking is disabled. Enable it to continue contract approval workflows.",
  },
  ASSET_ISSUE: {
    features: ["asset_tracking"],
    message: "Asset Tracking is disabled. Enable it to continue asset approval workflows.",
  },
  ASSET_RETURN: {
    features: ["asset_tracking"],
    message: "Asset Tracking is disabled. Enable it to continue asset return approval workflows.",
  },
  UNIFORM_ISSUE: {
    features: ["uniform_tracking"],
    message: "Uniform Tracking is disabled. Enable it to continue uniform approval workflows.",
  },
  UNIFORM_RETURN: {
    features: ["uniform_tracking"],
    message: "Uniform Tracking is disabled. Enable it to continue uniform return approval workflows.",
  },
};

const payrollKey = (key: string) => key.startsWith("payroll.") ? key : `payroll.${key}`;
const attendanceKey = (key: string) => key.startsWith("attendance.") ? key : `attendance.${key}`;

const featureEnabledFromFeatureSettings = async (env: Env, companyId: string, aliases: string[]) => {
  try {
    const result = await env.DB.prepare(
      `SELECT feature_key
       FROM feature_settings
       WHERE company_id = ?
         AND is_enabled = 1
         AND status IN ('active', 'enabled')`,
    ).bind(companyId).all<{ feature_key: string }>();
    const enabledKeys = new Set((result.results ?? []).map((row) => row.feature_key));
    return aliases.some((alias) => enabledKeys.has(alias));
  } catch {
    return false;
  }
};

export const resolveApprovalOperationTypeForLegacyApproval = (input: {
  operation_type?: string | null;
  workflow_key?: string | null;
  workflowKey?: string | null;
  module?: string | null;
  entity_type?: string | null;
  entityType?: string | null;
  subject_type?: string | null;
}) => {
  if (input.operation_type) return String(input.operation_type).toUpperCase();
  const text = [
    input.workflow_key,
    input.workflowKey,
    input.module,
    input.entity_type,
    input.entityType,
    input.subject_type,
  ].filter(Boolean).join(" ").toLowerCase();

  if (!text) return null;
  if (text.includes("attendance") && text.includes("correction")) return "ATTENDANCE_CORRECTION";
  if (text.includes("long") && text.includes("leave")) return "LONG_LEAVE_REQUEST";
  if (text.includes("leave")) return "LEAVE_REQUEST";
  if (text.includes("roster")) return "ROSTER_CHANGE";
  if (text.includes("advance")) return "ADVANCE_SALARY_REQUEST";
  if (text.includes("loan")) return "SALARY_LOAN_REQUEST";
  if (text.includes("manual") && (text.includes("deduction") || text.includes("adjustment"))) return "PAYROLL_ADJUSTMENT";
  if (text.includes("payroll") || text.includes("salary")) return "PAYROLL_APPROVAL";
  if (text.includes("document") || text.includes("kyc")) return "DOCUMENT_KYC_UPDATE";
  if (text.includes("structure") || text.includes("transfer")) return "EMPLOYEE_STRUCTURE_CHANGE";
  if (text.includes("employee")) return "EMPLOYEE_DOCUMENT_UPDATE";
  if (text.includes("resignation")) return "RESIGNATION";
  if (text.includes("offboarding")) return "OFFBOARDING";
  if (text.includes("disciplinary")) return "DISCIPLINARY_ACTION";
  if (text.includes("contract")) return "CONTRACT_RENEWAL";
  if (text.includes("asset")) return text.includes("return") ? "ASSET_RETURN" : "ASSET_ISSUE";
  if (text.includes("uniform")) return text.includes("return") ? "UNIFORM_RETURN" : "UNIFORM_ISSUE";
  return null;
};

const featureEnabled = async (env: Env, actor: AuthActor, feature: string) => {
  const aliases = resolveModuleFeatureAliases(feature);
  let checker: typeof settingsService.isFeatureEnabled | undefined;
  try {
    checker = (settingsService as typeof settingsService & {
      isFeatureEnabled?: typeof settingsService.isFeatureEnabled;
    }).isFeatureEnabled;
  } catch {
    return true;
  }
  if (typeof checker !== "function") return true;
  const checks = await Promise.all(aliases.map((alias) =>
    checker(env, actor.companyId, alias, actor).catch(() => false),
  ));
  return checks.some(Boolean) || await featureEnabledFromFeatureSettings(env, actor.companyId, aliases);
};

const attendanceSubFeatureEnabled = async (env: Env, actor: AuthActor, key: string) => {
  const settings = await settingsService.getAttendanceSettings(env, actor.companyId).catch(() => ({})) as Record<string, unknown>;
  const canonical = attendanceKey(key);
  const aliases: Record<string, string[]> = {
    "attendance.corrections_enabled": ["attendance.corrections_enabled", "attendance_correction_enabled"],
    "attendance.payroll_deductions_enabled": ["attendance.payroll_deductions_enabled", "absent_day_deduction_enabled", "deduct_absent_days"],
  };
  const matched = (aliases[canonical] ?? [canonical]).find((alias) => typeof settings[alias] === "boolean");
  return matched ? settings[matched] === true : true;
};

export const isApprovalOperationModuleEnabled = async (
  env: Env,
  actor: AuthActor,
  operationType: string | null | undefined,
): Promise<{ enabled: boolean; reason?: string }> => {
  const requirement = operationType ? APPROVAL_OPERATION_MODULE_REQUIREMENTS[operationType] : undefined;
  if (!requirement) return { enabled: true };

  for (const feature of requirement.features ?? []) {
    if (!await featureEnabled(env, actor, feature)) return { enabled: false, reason: requirement.message };
  }
  if (requirement.anyFeature?.length) {
    const checks = await Promise.all(requirement.anyFeature.map((feature) => featureEnabled(env, actor, feature)));
    if (!checks.some(Boolean)) return { enabled: false, reason: requirement.message };
  }
  for (const key of requirement.payrollSubFeatures ?? []) {
    if (!await settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, payrollKey(key) as PayrollSubFeatureKey).catch(() => false)) {
      return { enabled: false, reason: requirement.message };
    }
  }
  for (const key of requirement.attendanceSubFeatures ?? []) {
    if (!await attendanceSubFeatureEnabled(env, actor, key)) return { enabled: false, reason: requirement.message };
  }

  return { enabled: true };
};

export const assertApprovalOperationModuleEnabled = async (
  env: Env,
  actor: AuthActor,
  operationType: string | null | undefined,
) => {
  const result = await isApprovalOperationModuleEnabled(env, actor, operationType);
  if (!result.enabled) throw new FeatureDisabledError(result.reason);
};

export const getEnabledApprovalOperationTypes = async (
  env: Env,
  actor: AuthActor,
  operationTypes: readonly string[],
) => {
  const pairs = await Promise.all(operationTypes.map(async (operationType) => ({
    operationType,
    enabled: (await isApprovalOperationModuleEnabled(env, actor, operationType)).enabled,
  })));
  return pairs.filter((pair) => pair.enabled).map((pair) => pair.operationType);
};

export const isActiveApprovalStatus = (status: string | null | undefined) =>
  APPROVAL_ACTIVE_STATUSES.includes(String(status ?? "").toUpperCase() as (typeof APPROVAL_ACTIVE_STATUSES)[number]);

export const annotateApprovalModuleState = async <T extends Pick<ApprovalRequestEngineRecord, "operation_type" | "status">>(
  env: Env,
  actor: AuthActor,
  rows: T[],
) =>
  Promise.all(rows.map(async (row) => {
    const state = await isApprovalOperationModuleEnabled(env, actor, row.operation_type);
    return {
      ...row,
      module_enabled: state.enabled,
      disabled_reason: state.enabled ? null : state.reason ?? "Module disabled",
      read_only: !state.enabled && isActiveApprovalStatus(row.status),
    };
  }));

export type ApprovalModuleStateFields = Awaited<ReturnType<typeof annotateApprovalModuleState>>[number];
