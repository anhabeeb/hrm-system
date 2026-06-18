import type { AuthActor, DeviceAuthContext } from "../types/api.types";
import * as settingsRepository from "../modules/settings/settings.repository";
import type {
  ApprovalMode,
  CompanySettingRecord,
  FeatureSettingRecord,
} from "../modules/settings/settings.types";
import { isAdminOrSuperAdmin } from "./permission.service";

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

export const getFeatureSetting = settingsRepository.getFeatureSetting;
export const getSetting = settingsRepository.getSetting;
export const getSettingsGroup = settingsRepository.getSettingsGroup;

export const isFeatureEnabled = async (
  env: Env,
  companyId: string,
  featureKey: string,
  context?: AuthActor,
): Promise<boolean> => {
  const feature = await getFeatureSetting(env, companyId, featureKey);

  if (!feature) {
    return false;
  }

  const statusEnabled = ["active", "enabled"].includes(feature.status);

  if (feature.is_enabled !== 1 || !statusEnabled) {
    return false;
  }

  if (context && feature.allowed_role_ids_json) {
    const allowedRoleIdsOrKeys = parseJson<string[]>(
      feature.allowed_role_ids_json,
      [],
    );

    if (
      allowedRoleIdsOrKeys.length > 0 &&
      !context.roleKeys.some((roleKey) => allowedRoleIdsOrKeys.includes(roleKey)) &&
      !context.roles.some((roleName) => allowedRoleIdsOrKeys.includes(roleName))
    ) {
      return false;
    }
  }

  if (context && feature.allowed_outlet_ids_json && feature.applies_to_all_outlets !== 1) {
    const allowedOutletIds = parseJson<string[]>(feature.allowed_outlet_ids_json, []);

    if (
      allowedOutletIds.length > 0 &&
      !context.outletIds.some((outletId) => allowedOutletIds.includes(outletId))
    ) {
      return false;
    }
  }

  return true;
};

export const isFeatureEnabledForDevice = async (
  env: Env,
  companyId: string,
  featureKey: string,
  context: DeviceAuthContext,
): Promise<boolean> => {
  const feature = await getFeatureSetting(env, companyId, featureKey);

  if (!feature) {
    return false;
  }

  const statusEnabled = ["active", "enabled"].includes(feature.status);

  if (feature.is_enabled !== 1 || !statusEnabled) {
    return false;
  }

  if (feature.allowed_outlet_ids_json && feature.applies_to_all_outlets !== 1) {
    const allowedOutletIds = parseJson<string[]>(feature.allowed_outlet_ids_json, []);

    if (
      allowedOutletIds.length > 0 &&
      (!context.outletId || !allowedOutletIds.includes(context.outletId))
    ) {
      return false;
    }
  }

  return true;
};

const getJsonSetting = async <T>(
  env: Env,
  companyId: string,
  settingKey: string,
  fallback: T,
): Promise<T> => {
  const setting = await getSetting(env, companyId, settingKey);
  return parseJson<T>(setting?.setting_value_json, fallback);
};

export const getApprovalMode = async (
  env: Env,
  companyId: string,
): Promise<ApprovalMode> => {
  const settings = await getJsonSetting<{ approval_mode?: ApprovalMode }>(
    env,
    companyId,
    "approvals.default_rules",
    {},
  );

  return settings.approval_mode ?? "auto_admin_superadmin";
};

export const areApprovalWorkflowsEnabled = async (
  env: Env,
  companyId: string,
): Promise<boolean> => {
  const settings = await getJsonSetting<{ approval_workflows_enabled?: boolean }>(
    env,
    companyId,
    "approvals.default_rules",
    {},
  );

  return settings.approval_workflows_enabled !== false;
};

export interface SalaryApprovalSettings {
  salary_change_approval_enabled: boolean;
  promotion_salary_change_approval_enabled: boolean;
  salary_correction_approval_enabled: boolean;
  allow_requester_self_approval: boolean;
  allow_super_admin_override: boolean;
  auto_apply_when_no_eligible_approver: boolean;
  approval_request_expiry_days: number | null;
  approval_applying_recovery_minutes: number;
  require_reason_for_approval: boolean;
  require_reason_for_rejection: boolean;
  compensation_component_approval_enabled: boolean;
  compensation_allowance_approval_enabled: boolean;
  compensation_benefit_approval_enabled: boolean;
  compensation_deduction_approval_enabled: boolean;
}

export const getSalaryApprovalSettings = async (
  env: Env,
  companyId: string,
): Promise<SalaryApprovalSettings> => {
  const settings = await getJsonSetting<Partial<SalaryApprovalSettings>>(
    env,
    companyId,
    "approvals.salary_rules",
    {},
  );

  const expiryDays = Number(settings.approval_request_expiry_days);
  const recoveryMinutes = Number(settings.approval_applying_recovery_minutes);
  return {
    salary_change_approval_enabled: settings.salary_change_approval_enabled !== false,
    promotion_salary_change_approval_enabled: settings.promotion_salary_change_approval_enabled !== false,
    salary_correction_approval_enabled: settings.salary_correction_approval_enabled !== false,
    allow_requester_self_approval: settings.allow_requester_self_approval === true,
    allow_super_admin_override: settings.allow_super_admin_override !== false,
    auto_apply_when_no_eligible_approver: settings.auto_apply_when_no_eligible_approver !== false,
    approval_request_expiry_days: Number.isInteger(expiryDays) && expiryDays > 0 ? expiryDays : null,
    approval_applying_recovery_minutes: Number.isInteger(recoveryMinutes) && recoveryMinutes > 0 ? recoveryMinutes : 5,
    require_reason_for_approval: settings.require_reason_for_approval !== false,
    require_reason_for_rejection: settings.require_reason_for_rejection !== false,
    compensation_component_approval_enabled: settings.compensation_component_approval_enabled === true,
    compensation_allowance_approval_enabled: settings.compensation_allowance_approval_enabled === true,
    compensation_benefit_approval_enabled: settings.compensation_benefit_approval_enabled === true,
    compensation_deduction_approval_enabled: settings.compensation_deduction_approval_enabled === true,
  };
};

export const shouldRequireApproval = async (
  env: Env,
  companyId: string,
  _actionKey: string,
  context: AuthActor,
): Promise<boolean> => {
  if (!(await areApprovalWorkflowsEnabled(env, companyId))) {
    return false;
  }

  const mode = await getApprovalMode(env, companyId);

  if (mode === "disabled") {
    return false;
  }

  if (mode === "auto_admin_superadmin" && isAdminOrSuperAdmin(context)) {
    return false;
  }

  return true;
};

export const canDirectApprove = async (
  env: Env,
  companyId: string,
  context: AuthActor,
): Promise<boolean> => {
  const mode = await getApprovalMode(env, companyId);
  return mode === "auto_admin_superadmin" && isAdminOrSuperAdmin(context);
};

export const getPayrollSettings = (
  env: Env,
  companyId: string,
  _effectiveDate?: string,
): Promise<Record<string, unknown>> =>
  getJsonSetting(env, companyId, "payroll.default_rules", {});

export const PAYROLL_SUB_FEATURE_DEFAULTS = {
  "payroll.salary_processing_enabled": true,
  "payroll.payslips_enabled": true,
  "payroll.advances_enabled": true,
  "payroll.salary_loans_enabled": true,
  "payroll.overtime_enabled": true,
  "payroll.benefits_enabled": true,
  "payroll.manual_deductions_enabled": true,
  "payroll.attendance_deductions_enabled": true,
  "payroll.long_leave_deductions_enabled": true,
  "payroll.approvals_enabled": true,
} as const;

export type PayrollSubFeatureKey = keyof typeof PAYROLL_SUB_FEATURE_DEFAULTS;

const PAYROLL_SUB_FEATURE_ALIASES: Record<PayrollSubFeatureKey, string[]> = {
  "payroll.salary_processing_enabled": ["payroll.salary_processing_enabled", "monthly_payroll_enabled"],
  "payroll.payslips_enabled": ["payroll.payslips_enabled", "payslip_generation_enabled"],
  "payroll.advances_enabled": ["payroll.advances_enabled", "advance_payments_enabled"],
  "payroll.salary_loans_enabled": ["payroll.salary_loans_enabled", "salary_loans_enabled"],
  "payroll.overtime_enabled": ["payroll.overtime_enabled", "overtime_enabled"],
  "payroll.benefits_enabled": ["payroll.benefits_enabled", "benefits_enabled"],
  "payroll.manual_deductions_enabled": ["payroll.manual_deductions_enabled", "manual_deductions_enabled"],
  "payroll.attendance_deductions_enabled": ["payroll.attendance_deductions_enabled", "attendance_to_payroll_enabled", "deduct_absent_days"],
  "payroll.long_leave_deductions_enabled": ["payroll.long_leave_deductions_enabled", "long_leave_deductions_enabled"],
  "payroll.approvals_enabled": ["payroll.approvals_enabled", "approval_required"],
};

export const getPayrollSubFeatureSettings = async (
  env: Env,
  companyId: string,
): Promise<Record<string, unknown>> => {
  const [payrollSettings, earningsSetting] = await Promise.all([
    getPayrollSettings(env, companyId).catch(() => ({})),
    getSetting(env, companyId, "payroll.earnings_toggles")
      .then((setting) => parseJson<Record<string, unknown>>(setting?.setting_value_json, {}))
      .catch(() => ({})),
  ]);
  return { ...PAYROLL_SUB_FEATURE_DEFAULTS, ...payrollSettings, ...earningsSetting };
};

export const isPayrollSubFeatureEnabled = async (
  env: Env,
  companyId: string,
  key: PayrollSubFeatureKey,
): Promise<boolean> => {
  const settings = await getPayrollSubFeatureSettings(env, companyId);
  return PAYROLL_SUB_FEATURE_ALIASES[key].every((alias) => settings[alias] !== false);
};

export const getAttendanceSettings = (
  env: Env,
  companyId: string,
  _effectiveDate?: string,
): Promise<Record<string, unknown>> =>
  getJsonSetting(env, companyId, "attendance.default_rules", {});

export const getLeaveSettings = async (
  env: Env,
  companyId: string,
  _effectiveDate?: string,
): Promise<CompanySettingRecord[]> => getSettingsGroup(env, companyId, "leave");

export const getSyncSettings = (
  env: Env,
  companyId: string,
  _effectiveDate?: string,
): Promise<Record<string, unknown>> =>
  getJsonSetting(env, companyId, "sync.default_rules", {});

export interface SessionSecuritySettings {
  session_timeout_minutes: number | null;
  idle_timeout_minutes: number | null;
  concurrent_session_policy: "block_new_login" | "revoke_old_session";
  allow_admin_session_override: boolean;
  session_device_tracking_enabled: boolean;
  remember_me_allowed: boolean;
  remember_me_session_days: number | null;
}

const positiveMinutesOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const positiveDaysOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const getSessionSecuritySettings = async (
  env: Env,
  companyId: string,
): Promise<SessionSecuritySettings> => {
  const settings = await getJsonSetting<Record<string, unknown>>(
    env,
    companyId,
    "security.default_rules",
    {},
  ).catch((): Record<string, unknown> => ({}));

  return {
    session_timeout_minutes: positiveMinutesOrNull(settings.session_timeout_minutes),
    idle_timeout_minutes: positiveMinutesOrNull(settings.idle_timeout_minutes),
    concurrent_session_policy:
      settings.concurrent_session_policy === "revoke_old_session"
        ? "revoke_old_session"
        : "block_new_login",
    allow_admin_session_override: settings.allow_admin_session_override === true,
    session_device_tracking_enabled: settings.session_device_tracking_enabled !== false,
    remember_me_allowed: settings.remember_me_allowed === true,
    remember_me_session_days: positiveDaysOrNull(settings.remember_me_session_days),
  };
};

export type { FeatureSettingRecord };
