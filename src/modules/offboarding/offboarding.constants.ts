export const OFFBOARDING_CASE_STATUSES = [
  "draft",
  "in_progress",
  "pending_clearance",
  "ready_for_final_settlement",
  "completed",
  "cancelled",
] as const;

export const ACTIVE_OFFBOARDING_STATUSES = [
  "draft",
  "in_progress",
  "pending_clearance",
  "ready_for_final_settlement",
] as const;

export const OFFBOARDING_TYPES = [
  "resignation",
  "termination",
  "retirement",
  "contract_end",
  "other",
] as const;

export const OFFBOARDING_TASK_TYPES = [
  "return_asset",
  "return_uniform",
  "revoke_user_access",
  "complete_attendance",
  "close_leave",
  "clear_salary_advance",
  "clear_salary_loan",
  "collect_documents",
  "final_payroll_review",
  "exit_interview",
  "custom",
] as const;

export const OFFBOARDING_TASK_STATUSES = [
  "pending",
  "completed",
  "waived",
  "blocked",
] as const;

export const LEAVING_EMPLOYEE_STATUSES = [
  "resigned",
  "terminated",
  "retired",
  "inactive",
] as const;

export const FINALIZED_PAYROLL_STATUSES = [
  "finalizing",
  "finalized",
  "locked",
  "paid",
] as const;
