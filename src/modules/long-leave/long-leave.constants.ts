export const LONG_LEAVE_STATUSES = [
  "draft",
  "submitted",
  "pending",
  "pending_approval",
  "approved",
  "active",
  "extended",
  "rejected",
  "returned",
  "cancelled",
  "expired",
] as const;

export const LONG_LEAVE_AUDIT_ACTIONS = {
  created: "long_leave_created",
  submitted: "long_leave_submitted",
  salaryImpactCalculated: "long_leave_salary_impact_calculated",
  salaryImpactConfirmed: "long_leave_salary_impact_confirmed",
  approved: "long_leave_approved",
  rejected: "long_leave_rejected",
  cancelled: "long_leave_cancelled",
  extended: "long_leave_extended",
  returned: "long_leave_returned",
  payrollPreviewGenerated: "long_leave_payroll_preview_generated",
  payrollImpactApplied: "long_leave_payroll_impact_applied",
  payrollImpactBlocked: "long_leave_payroll_impact_blocked",
  overrideSaved: "long_leave_override_saved",
  settingsChanged: "long_leave_settings_changed",
} as const;

export const DEFAULT_LONG_LEAVE_TRIGGER_DAYS = 30;
export const DEFAULT_SALARY_CALCULATION_DAYS = 30;
export const LOCKED_PAYROLL_STATUSES = ["finalizing", "finalized", "locked", "paid"] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
