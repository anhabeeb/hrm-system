import { resolveModuleFeatureAliases } from "../../config/module-codes";
import * as settingsService from "../../services/settings.service";
import type { PayrollSubFeatureKey } from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import type { NotificationPayload } from "./notifications.types";

const alwaysOnCategories = new Set(["system", "security", "backup"]);

export const notificationCategories = [
  "leave",
  "long_leave",
  "attendance",
  "biometric",
  "roster",
  "holiday",
  "payroll",
  "documents",
  "contracts",
  "assets",
  "uniforms",
  "approvals",
  "system",
  "security",
  "backup",
] as const;

export const expirySourceTypesByModule = {
  document_tracking: ["employee_document", "employee_passport", "employee_work_permit"],
  contract_tracking: ["contract", "probation"],
  long_leave_management: ["long_leave_return"],
  asset_tracking: ["asset_assignment"],
  uniform_tracking: ["uniform_return"],
} as const;

const featureEnabled = async (
  env: Env,
  companyId: string,
  moduleCode: string,
  context?: AuthActor,
): Promise<boolean> => {
  const aliases = resolveModuleFeatureAliases(moduleCode);
  for (const alias of aliases) {
    if (await settingsService.isFeatureEnabled(env, companyId, alias, context).catch(() => false)) {
      return true;
    }
  }
  return false;
};

const attendanceSubFeatureEnabled = async (
  env: Env,
  companyId: string,
  key: "corrections_enabled" | "payroll_deductions_enabled" | "kiosk_enabled" | "biometric_enabled",
): Promise<boolean> => {
  const settings = await settingsService.getAttendanceSettings(env, companyId).catch(() => ({})) as Record<string, unknown>;
  const aliases: Record<typeof key, string[]> = {
    corrections_enabled: ["attendance.corrections_enabled", "attendance_correction_enabled"],
    payroll_deductions_enabled: ["attendance.payroll_deductions_enabled", "absent_day_deduction_enabled", "deduct_absent_days"],
    kiosk_enabled: ["attendance.kiosk_enabled", "kiosk_mode_enabled"],
    biometric_enabled: ["attendance.biometric_enabled", "biometric_enabled"],
  };
  return aliases[key].every((alias) => settings[alias] !== false);
};

const payrollSubFeatureEnabled = (
  env: Env,
  companyId: string,
  key: PayrollSubFeatureKey,
): Promise<boolean> => settingsService.isPayrollSubFeatureEnabled(env, companyId, key).catch(() => false);

const textForPayload = (payload: Partial<NotificationPayload>) =>
  [
    payload.category,
    payload.notification_type,
    payload.event_key,
    payload.entity_type,
    payload.action_url,
  ].filter(Boolean).join(" ").toLowerCase();

const hasAny = (value: string, tokens: string[]) => tokens.some((token) => value.includes(token));

const payrollRequirementForPayload = async (
  env: Env,
  companyId: string,
  payload: Partial<NotificationPayload>,
  context?: AuthActor,
) => {
  if (!(await featureEnabled(env, companyId, "payroll", context))) return false;
  const text = textForPayload(payload);
  if (hasAny(text, ["payslip"])) {
    return (await featureEnabled(env, companyId, "payslips", context)) && (await payrollSubFeatureEnabled(env, companyId, "payroll.payslips_enabled"));
  }
  if (hasAny(text, ["advance"])) {
    return (await featureEnabled(env, companyId, "advance_salary", context)) && (await payrollSubFeatureEnabled(env, companyId, "payroll.advances_enabled"));
  }
  if (hasAny(text, ["loan"])) return payrollSubFeatureEnabled(env, companyId, "payroll.salary_loans_enabled");
  if (hasAny(text, ["overtime"])) return payrollSubFeatureEnabled(env, companyId, "payroll.overtime_enabled");
  if (hasAny(text, ["benefit"])) return payrollSubFeatureEnabled(env, companyId, "payroll.benefits_enabled");
  if (hasAny(text, ["attendance_deduction", "attendance deduction", "absent_day_deduction", "late_deduction", "late deduction", "absent deduction"])) {
    return (await featureEnabled(env, companyId, "attendance", context)) &&
      (await payrollSubFeatureEnabled(env, companyId, "payroll.attendance_deductions_enabled")) &&
      (await attendanceSubFeatureEnabled(env, companyId, "payroll_deductions_enabled"));
  }
  if (hasAny(text, ["long_leave_deduction", "long leave deduction"])) {
    return (await featureEnabled(env, companyId, "long_leave_management", context)) &&
      payrollSubFeatureEnabled(env, companyId, "payroll.long_leave_deductions_enabled");
  }
  if (hasAny(text, ["manual_deduction", "manual deduction", "payroll_adjustment", "manual adjustment"])) {
    return payrollSubFeatureEnabled(env, companyId, "payroll.manual_deductions_enabled");
  }
  if (hasAny(text, ["approval", "approve"])) return payrollSubFeatureEnabled(env, companyId, "payroll.approvals_enabled");
  return true;
};

export const isNotificationPayloadModuleEnabled = async (
  env: Env,
  companyId: string,
  payload: Partial<NotificationPayload>,
  context?: AuthActor,
): Promise<{ enabled: boolean; reason?: string }> => {
  const category = String(payload.category ?? "system").toLowerCase();
  if (alwaysOnCategories.has(category)) return { enabled: true };

  const text = textForPayload(payload);
  const disabled = (reason: string) => ({ enabled: false, reason });
  const moduleEnabled = (moduleCode: string) => featureEnabled(env, companyId, moduleCode, context);

  if (category === "leave") return (await moduleEnabled("leave_management")) ? { enabled: true } : disabled("Leave Management is disabled.");
  if (category === "long_leave") return (await moduleEnabled("long_leave_management")) ? { enabled: true } : disabled("Long Leave Management is disabled.");
  if (category === "documents") return (await moduleEnabled("document_tracking")) ? { enabled: true } : disabled("Document Tracking is disabled.");
  if (category === "contracts") return (await moduleEnabled("contract_tracking")) ? { enabled: true } : disabled("Contract Tracking is disabled.");
  if (category === "assets") return (await moduleEnabled("asset_tracking")) ? { enabled: true } : disabled("Asset Tracking is disabled.");
  if (category === "uniforms") return (await moduleEnabled("uniform_tracking")) ? { enabled: true } : disabled("Uniform Tracking is disabled.");
  if (category === "roster") return (await moduleEnabled("roster")) ? { enabled: true } : disabled("Roster Management is disabled.");
  if (category === "holiday") {
    if (hasAny(text, ["roster"])) return (await moduleEnabled("roster")) ? { enabled: true } : disabled("Roster Management is disabled.");
    return (await moduleEnabled("leave_management")) ? { enabled: true } : disabled("Leave Management is disabled.");
  }
  if (category === "biometric") {
    const enabled = (await moduleEnabled("attendance")) &&
      (await moduleEnabled("biometric")) &&
      (await attendanceSubFeatureEnabled(env, companyId, "biometric_enabled"));
    return enabled ? { enabled: true } : disabled("Biometric Attendance is disabled.");
  }
  if (category === "attendance") {
    if (!(await moduleEnabled("attendance"))) return disabled("Attendance Management is disabled.");
    if (hasAny(text, ["correction"])) {
      return (await attendanceSubFeatureEnabled(env, companyId, "corrections_enabled")) ? { enabled: true } : disabled("Attendance Corrections are disabled.");
    }
    if (hasAny(text, ["kiosk"])) {
      return (await attendanceSubFeatureEnabled(env, companyId, "kiosk_enabled")) ? { enabled: true } : disabled("Kiosk Attendance is disabled.");
    }
    if (hasAny(text, ["biometric"])) {
      return (await attendanceSubFeatureEnabled(env, companyId, "biometric_enabled")) ? { enabled: true } : disabled("Biometric Attendance is disabled.");
    }
    if (hasAny(text, ["payroll_deduction", "attendance_deduction", "deduction"])) {
      return (await attendanceSubFeatureEnabled(env, companyId, "payroll_deductions_enabled")) ? { enabled: true } : disabled("Attendance Payroll Deductions are disabled.");
    }
    return { enabled: true };
  }
  if (category === "payroll") {
    return (await payrollRequirementForPayload(env, companyId, payload, context)) ? { enabled: true } : disabled("The related Payroll feature is disabled.");
  }
  if (category === "approvals") {
    if (!(await moduleEnabled("approvals"))) return disabled("Approvals are disabled.");
    if (hasAny(text, ["leave"]) && !(await moduleEnabled("leave_management"))) return disabled("Leave Management is disabled.");
    if (hasAny(text, ["long_leave"]) && !(await moduleEnabled("long_leave_management"))) return disabled("Long Leave Management is disabled.");
    if (hasAny(text, ["attendance"]) && !(await isNotificationPayloadModuleEnabled(env, companyId, { ...payload, category: "attendance" }, context)).enabled) return disabled("Attendance Management or its sub-feature is disabled.");
    if (hasAny(text, ["roster"]) && !(await moduleEnabled("roster"))) return disabled("Roster Management is disabled.");
    if (hasAny(text, ["payroll", "advance", "loan", "payslip"]) && !(await payrollRequirementForPayload(env, companyId, { ...payload, category: "payroll" }, context))) return disabled("The related Payroll feature is disabled.");
    if (hasAny(text, ["document", "kyc"]) && !(await moduleEnabled("document_tracking"))) return disabled("Document Tracking is disabled.");
    if (hasAny(text, ["contract", "probation"]) && !(await moduleEnabled("contract_tracking"))) return disabled("Contract Tracking is disabled.");
    if (hasAny(text, ["asset"]) && !(await moduleEnabled("asset_tracking"))) return disabled("Asset Tracking is disabled.");
    if (hasAny(text, ["uniform"]) && !(await moduleEnabled("uniform_tracking"))) return disabled("Uniform Tracking is disabled.");
    return { enabled: true };
  }

  return { enabled: true };
};

export const getEnabledNotificationCategories = async (
  env: Env,
  companyId: string,
  context?: AuthActor,
): Promise<Set<string>> => {
  const enabled = new Set<string>();
  for (const category of notificationCategories) {
    if ((await isNotificationPayloadModuleEnabled(env, companyId, { category, notification_type: `${category}_category_check` }, context)).enabled) {
      enabled.add(category);
    }
  }
  return enabled;
};

export const filterByEnabledCategories = <T extends { category: string }>(
  rows: T[],
  enabledCategories: Set<string>,
): T[] => rows.filter((row) => enabledCategories.has(row.category));

export const isExpirySourceTypeEnabled = async (
  env: Env,
  companyId: string,
  sourceType: string,
  context?: AuthActor,
): Promise<boolean> => {
  if ((expirySourceTypesByModule.document_tracking as readonly string[]).includes(sourceType)) {
    return featureEnabled(env, companyId, "document_tracking", context);
  }
  if ((expirySourceTypesByModule.contract_tracking as readonly string[]).includes(sourceType)) {
    return featureEnabled(env, companyId, "contract_tracking", context);
  }
  if ((expirySourceTypesByModule.long_leave_management as readonly string[]).includes(sourceType)) {
    return featureEnabled(env, companyId, "long_leave_management", context);
  }
  if ((expirySourceTypesByModule.asset_tracking as readonly string[]).includes(sourceType)) {
    return featureEnabled(env, companyId, "asset_tracking", context);
  }
  if ((expirySourceTypesByModule.uniform_tracking as readonly string[]).includes(sourceType)) {
    return featureEnabled(env, companyId, "uniform_tracking", context);
  }
  return true;
};

export const getEnabledExpirySourceTypes = async (
  env: Env,
  companyId: string,
  context?: AuthActor,
): Promise<Set<string>> => {
  const allTypes = Object.values(expirySourceTypesByModule).flat();
  const enabled = new Set<string>();
  for (const sourceType of allTypes) {
    if (await isExpirySourceTypeEnabled(env, companyId, sourceType, context)) {
      enabled.add(sourceType);
    }
  }
  return enabled;
};

export const applyEnabledExpirySourceToggles = (
  sourceToggles: Record<string, boolean>,
  enabledSourceTypes: Set<string>,
): Record<string, boolean> => ({
  ...sourceToggles,
  employee_documents: sourceToggles.employee_documents !== false && enabledSourceTypes.has("employee_document"),
  employee_passport: sourceToggles.employee_passport !== false && enabledSourceTypes.has("employee_passport"),
  employee_work_permit: sourceToggles.employee_work_permit !== false && enabledSourceTypes.has("employee_work_permit"),
  contracts: sourceToggles.contracts !== false && enabledSourceTypes.has("contract"),
  probation: sourceToggles.probation !== false && enabledSourceTypes.has("probation"),
  long_leave_return: sourceToggles.long_leave_return !== false && enabledSourceTypes.has("long_leave_return"),
  assets: sourceToggles.assets === true && enabledSourceTypes.has("asset_assignment"),
  uniforms: sourceToggles.uniforms === true && enabledSourceTypes.has("uniform_return"),
});
