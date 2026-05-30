export const LONG_LEAVE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "returned",
  "cancelled",
] as const;

export const LONG_LEAVE_AUDIT_ACTIONS = {
  created: "long_leave_created",
  salaryImpactCalculated: "long_leave_salary_impact_calculated",
  salaryImpactConfirmed: "long_leave_salary_impact_confirmed",
  approved: "long_leave_approved",
  rejected: "long_leave_rejected",
  returned: "long_leave_returned",
  overrideSaved: "long_leave_override_saved",
} as const;

export const DEFAULT_LONG_LEAVE_TRIGGER_DAYS = 30;
export const DEFAULT_SALARY_CALCULATION_DAYS = 30;
export const LOCKED_PAYROLL_STATUSES = ["locked", "paid"] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
