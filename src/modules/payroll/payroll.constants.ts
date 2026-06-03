export const PAYROLL_STATUSES = [
  "draft",
  "reviewed",
  "submitted",
  "approved",
  "rejected",
  "locked",
  "paid",
  "reopened",
] as const;

export const PAYROLL_LOCKED_STATUSES = ["locked", "paid"] as const;
export const PAYROLL_EXCEPTION_SEVERITIES = ["info", "warning", "critical"] as const;
export const PAYROLL_EXCEPTION_STATUSES = ["open", "resolved", "reviewed"] as const;

export const PAYROLL_AUDIT_ACTIONS = {
  calculated: "payroll_calculated",
  recalculated: "payroll_recalculated",
  exceptionResolved: "payroll_exception_resolved",
  submittedForApproval: "payroll_submitted_for_approval",
  approved: "payroll_approved",
  rejected: "payroll_rejected",
  locked: "payroll_locked",
  reopenRequested: "payroll_reopen_requested",
  reopenApproved: "payroll_reopen_approved",
  reopened: "payroll_reopened",
  exportPrepared: "payroll_export_prepared",
} as const;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SALARY_BASIS = "fixed_30_days";
