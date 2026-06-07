export const PAYROLL_STATUSES = [
  "draft",
  "reviewed",
  "submitted",
  "pending_approval",
  "approved",
  "finalizing",
  "finalized",
  "finalization_failed",
  "rejected",
  "locked",
  "paid",
  "reopened",
  "calculating",
  "calculation_failed",
] as const;

export const PAYROLL_LOCKED_STATUSES = ["finalized", "locked", "paid", "finalizing"] as const;
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
  finalizationStarted: "PAYROLL_FINALIZATION_STARTED",
  finalized: "PAYROLL_FINALIZED",
  finalizationFailed: "PAYROLL_FINALIZATION_FAILED",
  repaymentApplied: "PAYROLL_REPAYMENT_APPLIED",
  repaymentSkippedAlreadyApplied: "PAYROLL_REPAYMENT_SKIPPED_ALREADY_APPLIED",
  editBlockedFinalized: "PAYROLL_EDIT_BLOCKED_FINALIZED",
  reopenRequested: "payroll_reopen_requested",
  reopenApproved: "payroll_reopen_approved",
  reopened: "payroll_reopened",
  exportPrepared: "payroll_export_prepared",
  calculationStarted: "PAYROLL_CALCULATION_STARTED",
  calculationCompleted: "PAYROLL_CALCULATION_COMPLETED",
  calculationFailed: "PAYROLL_CALCULATION_FAILED",
  employeeCalculationFailed: "PAYROLL_EMPLOYEE_CALCULATION_FAILED",
  generatedItemsRebuilt: "PAYROLL_GENERATED_ITEMS_REBUILT",
} as const;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SALARY_BASIS = "fixed_30_days";
