export const EMPLOYEE_TYPES = ["local", "foreign"] as const;

export const EMPLOYMENT_STATUSES = [
  "active",
  "probation",
  "confirmed",
  "on_leave",
  "long_leave",
  "suspended",
  "resigned",
  "terminated",
  "retired",
  "inactive",
  "rehired",
  "archived",
] as const;

export const EMPLOYEE_PAYROLL_ELIGIBLE_STATUSES = [
  "active",
  "probation",
  "confirmed",
  "on_leave",
  "long_leave",
  "rehired",
] as const;

export const EMPLOYEE_EXIT_STATUSES = ["resigned", "terminated", "retired", "inactive", "archived"] as const;

export const EMPLOYEE_STATUS_ACCESS_DEFAULTS: Record<string, { disableUserAccess: boolean; revokeActiveSessions: boolean }> = {
  suspended: { disableUserAccess: true, revokeActiveSessions: true },
  resigned: { disableUserAccess: true, revokeActiveSessions: true },
  terminated: { disableUserAccess: true, revokeActiveSessions: true },
  retired: { disableUserAccess: true, revokeActiveSessions: true },
  inactive: { disableUserAccess: true, revokeActiveSessions: true },
};

export const EMPLOYEE_SORT_FIELDS = [
  "employee_code",
  "full_name",
  "employee_type",
  "nationality",
  "employment_status",
  "joined_at",
  "created_at",
  "updated_at",
] as const;

export const EMPLOYEE_SENSITIVE_FIELDS = [
  "id_card_number",
  "passport_number",
  "work_permit_number",
] as const;

export const COMPENSATION_COMPONENT_TYPES = [
  "allowance",
  "benefit",
  "deduction",
] as const;

export const COMPENSATION_CALCULATION_TYPES = [
  "fixed_amount",
  "percentage_of_basic_salary",
  "non_cash_benefit",
] as const;

export const COMPENSATION_COMPONENT_STATUSES = [
  "active",
  "scheduled",
  "ended",
  "cancelled",
  "pending_approval",
] as const;
