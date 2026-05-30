export const EMPLOYEE_TYPES = ["local", "foreign"] as const;

export const EMPLOYMENT_STATUSES = [
  "active",
  "on_leave",
  "long_leave",
  "suspended",
  "resigned",
  "terminated",
  "archived",
] as const;

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
] as const;
