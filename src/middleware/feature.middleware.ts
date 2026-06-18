import { createMiddleware } from "hono/factory";

import { resolveModuleFeatureAliases } from "../config/module-codes";
import * as settingsService from "../services/settings.service";
import type { AppContext } from "../types/api.types";
import { AppError, AuthError, DeviceAuthError, FeatureDisabledError } from "../utils/errors";

const disabledFeatureMessages: Record<string, string> = {
  attendance: "Attendance Management is disabled. Enable it in Settings to use this module.",
  payroll: "Payroll Management is disabled. Enable it in Settings to use this module.",
  leave_management: "Leave Management is disabled. Enable it in Settings to use this module.",
  long_leave_management: "Long Leave Management is disabled. Enable it in Settings to use this module.",
  documents: "Document Tracking is disabled. Enable it in Settings to use this module.",
  asset_tracking: "Asset Tracking is disabled. Enable it in Settings to use this module.",
  uniform_tracking: "Uniform Tracking is disabled. Enable it in Settings to use this module.",
  roster: "Duty Roster is disabled. Enable it in Settings to use this module.",
  contract_tracking: "Contract Tracking is disabled. Enable it in Settings to use this module.",
};

export const requireFeature = (featureKey: string) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    const featureKeys = resolveModuleFeatureAliases(featureKey);
    let enabled = false;

    if (authUser) {
      const checks = await Promise.all(
        featureKeys.map((key) =>
          settingsService.isFeatureEnabled(c.env, authUser.companyId, key, authUser),
        ),
      );
      enabled = checks.some(Boolean);
    } else if (deviceAuth) {
      const checks = await Promise.all(
        featureKeys.map((key) =>
          settingsService.isFeatureEnabledForDevice(c.env, deviceAuth.companyId, key, deviceAuth),
        ),
      );
      enabled = checks.some(Boolean);
    } else {
      throw new AuthError("Please sign in to continue.");
    }

    if (!enabled) {
      const disabledMessage = disabledFeatureMessages[featureKey];
      if (!disabledMessage) throw new FeatureDisabledError("This module is currently disabled.");
      throw new FeatureDisabledError(disabledMessage);
    }

    await next();
  });

export type AttendanceSubFeatureKey =
  | "attendance.manual_entry_enabled"
  | "attendance.kiosk_enabled"
  | "attendance.biometric_enabled"
  | "attendance.corrections_enabled"
  | "attendance.payroll_deductions_enabled";

const attendanceSubFeatureAliases: Record<AttendanceSubFeatureKey, string[]> = {
  "attendance.manual_entry_enabled": ["attendance.manual_entry_enabled", "manual_attendance_enabled"],
  "attendance.kiosk_enabled": ["attendance.kiosk_enabled", "kiosk_mode_enabled"],
  "attendance.biometric_enabled": ["attendance.biometric_enabled", "biometric_enabled"],
  "attendance.corrections_enabled": ["attendance.corrections_enabled", "attendance_correction_enabled"],
  "attendance.payroll_deductions_enabled": ["attendance.payroll_deductions_enabled", "absent_day_deduction_enabled", "deduct_absent_days"],
};

const attendanceSubFeatureDefaults: Record<AttendanceSubFeatureKey, boolean> = {
  "attendance.manual_entry_enabled": true,
  "attendance.kiosk_enabled": true,
  "attendance.biometric_enabled": false,
  "attendance.corrections_enabled": true,
  "attendance.payroll_deductions_enabled": true,
};

const disabledAttendanceSubFeatureMessages: Record<AttendanceSubFeatureKey, string> = {
  "attendance.manual_entry_enabled": "Manual Attendance is disabled. Enable it in Attendance Settings to use this action.",
  "attendance.kiosk_enabled": "Kiosk Attendance is disabled. Enable it in Attendance Settings to use this action.",
  "attendance.biometric_enabled": "Biometric Attendance is disabled. Enable it in Attendance Settings to use this action.",
  "attendance.corrections_enabled": "Attendance Corrections are disabled. Enable them in Attendance Settings to use this action.",
  "attendance.payroll_deductions_enabled": "Attendance Payroll Deductions are disabled. Enable them in Attendance Settings to use this report.",
};

const readBooleanSetting = (
  settings: Record<string, unknown>,
  canonicalKey: AttendanceSubFeatureKey,
) => {
  const aliases = attendanceSubFeatureAliases[canonicalKey] ?? [canonicalKey];
  const matched = aliases.find((key) => typeof settings[key] === "boolean");
  return matched ? settings[matched] === true : attendanceSubFeatureDefaults[canonicalKey] ?? true;
};

export const requireAttendanceSubFeature = (canonicalKey: AttendanceSubFeatureKey) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    const companyId = authUser?.companyId ?? deviceAuth?.companyId;

    if (!companyId) {
      throw new AuthError("Please sign in to continue.");
    }

    const settings = await settingsService.getAttendanceSettings(c.env, companyId).catch(() => ({}));
    if (!readBooleanSetting(settings, canonicalKey)) {
      throw new FeatureDisabledError(disabledAttendanceSubFeatureMessages[canonicalKey] ?? "This attendance feature is currently disabled.");
    }

    await next();
  });

export type PayrollSubFeatureKey =
  | "payroll.salary_processing_enabled"
  | "payroll.payslips_enabled"
  | "payroll.advances_enabled"
  | "payroll.salary_loans_enabled"
  | "payroll.overtime_enabled"
  | "payroll.benefits_enabled"
  | "payroll.manual_deductions_enabled"
  | "payroll.attendance_deductions_enabled"
  | "payroll.long_leave_deductions_enabled"
  | "payroll.approvals_enabled";

const payrollSubFeatureAliases: Record<PayrollSubFeatureKey, string[]> = {
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

const payrollSubFeatureDefaults: Record<PayrollSubFeatureKey, boolean> = {
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
};

const disabledPayrollSubFeatureMessages: Record<PayrollSubFeatureKey, string> = {
  "payroll.salary_processing_enabled": "Salary Processing is disabled. Enable it in Payroll Settings to use this action.",
  "payroll.payslips_enabled": "Payslips are disabled. Enable them in Payroll Settings to use this action.",
  "payroll.advances_enabled": "Advance Salary is disabled. Enable it in Payroll Settings to use this action.",
  "payroll.salary_loans_enabled": "Salary Loans are disabled. Enable them in Payroll Settings to use this action.",
  "payroll.overtime_enabled": "Overtime is disabled. Enable it in Payroll Settings to use this report.",
  "payroll.benefits_enabled": "Benefits are disabled. Enable them in Payroll Settings to use this action.",
  "payroll.manual_deductions_enabled": "Manual Deductions are disabled. Enable them in Payroll Settings to use this action.",
  "payroll.attendance_deductions_enabled": "Payroll Attendance Deductions are disabled. Enable them in Payroll Settings to use this report.",
  "payroll.long_leave_deductions_enabled": "Long Leave Deductions are disabled. Enable them in Payroll Settings to use this report.",
  "payroll.approvals_enabled": "Payroll Approvals are disabled. Enable them in Payroll Settings to use approval actions.",
};

const readPayrollBooleanSetting = (
  settings: Record<string, unknown>,
  earningsSettings: Record<string, unknown>,
  canonicalKey: PayrollSubFeatureKey,
) => {
  const merged = { ...earningsSettings, ...settings };
  const aliases = payrollSubFeatureAliases[canonicalKey] ?? [canonicalKey];
  const matched = aliases.find((key) => typeof merged[key] === "boolean");
  return matched ? merged[matched] === true : payrollSubFeatureDefaults[canonicalKey] ?? true;
};

export const requirePayrollSubFeature = (canonicalKey: PayrollSubFeatureKey) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const companyId = authUser?.companyId;

    if (!companyId) {
      throw new AuthError("Please sign in to continue.");
    }

    const [settings, earningsSettings] = await Promise.all([
      settingsService.getPayrollSettings(c.env, companyId).catch(() => ({})),
      settingsService.getSetting(c.env, companyId, "payroll.earnings_toggles")
        .then((setting) => setting?.setting_value_json ? JSON.parse(setting.setting_value_json) as Record<string, unknown> : {})
        .catch(() => ({})),
    ]);
    if (!readPayrollBooleanSetting(settings, earningsSettings, canonicalKey)) {
      throw new FeatureDisabledError(disabledPayrollSubFeatureMessages[canonicalKey] ?? "This payroll feature is currently disabled.");
    }

    await next();
  });

export const requireAnyFeature = (
  featureKeys: string[],
  options: {
    message?: string;
    code?: string;
  } = {},
) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    let checks: boolean[];

    const expandedFeatureKeys = featureKeys.flatMap(resolveModuleFeatureAliases);

    if (authUser) {
      checks = await Promise.all(
        expandedFeatureKeys.map((featureKey) =>
          settingsService.isFeatureEnabled(
            c.env,
            authUser.companyId,
            featureKey,
            authUser,
          ),
        ),
      );
    } else if (deviceAuth) {
      checks = await Promise.all(
        expandedFeatureKeys.map((featureKey) =>
          settingsService.isFeatureEnabledForDevice(
            c.env,
            deviceAuth.companyId,
            featureKey,
            deviceAuth,
          ),
        ),
      );
    } else {
      throw new DeviceAuthError("Device authentication is required.");
    }

    if (!checks.some(Boolean)) {
      if (options.code && options.code !== "FEATURE_DISABLED") {
        throw new AppError({
          message: options.message ?? "This module is currently disabled.",
          code: options.code,
          title: "Feature disabled",
          statusCode: 403,
          retryable: false,
          suggestedAction: "Enable one of the required features in Settings if this action should be available.",
        });
      }
      throw new FeatureDisabledError(options.message ?? "This module is currently disabled.");
    }

    await next();
  });
