import { createMiddleware } from "hono/factory";

import { resolveModuleFeatureAliases } from "../config/module-codes";
import * as settingsService from "../services/settings.service";
import type { AppContext } from "../types/api.types";
import { AuthError, DeviceAuthError, FeatureDisabledError } from "../utils/errors";

const disabledFeatureMessages: Record<string, string> = {
  attendance: "Attendance Management is disabled. Enable it in Settings to use this module.",
  leave_management: "Leave Management is disabled. Enable it in Settings to use this module.",
  long_leave_management: "Long Leave Management is disabled. Enable it in Settings to use this module.",
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
      throw new FeatureDisabledError(disabledFeatureMessages[featureKey] ?? "This module is currently disabled.");
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

export const requireAnyFeature = (featureKeys: string[]) =>
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
      throw new FeatureDisabledError("This module is currently disabled.");
    }

    await next();
  });
