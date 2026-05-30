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

export type { FeatureSettingRecord };
