import type { CurrentUser } from "@/types/auth";

export type PayrollSubFeatureKey =
  | "salary_processing_enabled"
  | "payslips_enabled"
  | "advances_enabled"
  | "salary_loans_enabled"
  | "overtime_enabled"
  | "benefits_enabled"
  | "manual_deductions_enabled"
  | "attendance_deductions_enabled"
  | "long_leave_deductions_enabled"
  | "approvals_enabled";

export type AttendanceSubFeatureKey =
  | "manual_entry_enabled"
  | "kiosk_enabled"
  | "biometric_enabled"
  | "corrections_enabled"
  | "payroll_deductions_enabled";

const hasSubFeature = (
  values: Record<string, boolean | undefined> | undefined,
  key?: string,
) => !key || values?.[key] !== false;

export const hasPayrollSubFeature = (user: CurrentUser | null, key?: PayrollSubFeatureKey) =>
  hasSubFeature(user?.payroll_subfeatures, key);

export const hasAllPayrollSubFeatures = (user: CurrentUser | null, keys?: PayrollSubFeatureKey[]) =>
  !keys || keys.length === 0 || keys.every((key) => hasPayrollSubFeature(user, key));

export const hasAttendanceSubFeature = (user: CurrentUser | null, key?: AttendanceSubFeatureKey) =>
  hasSubFeature(user?.attendance_subfeatures, key);

export const hasAllAttendanceSubFeatures = (user: CurrentUser | null, keys?: AttendanceSubFeatureKey[]) =>
  !keys || keys.length === 0 || keys.every((key) => hasAttendanceSubFeature(user, key));
