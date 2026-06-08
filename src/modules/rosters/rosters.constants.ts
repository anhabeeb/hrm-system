export const ROSTER_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
export const SHIFT_TEMPLATE_STATUSES = ["active", "inactive"] as const;
export const ROSTER_CONFLICT_SEVERITIES = ["warning", "error"] as const;
export const ROSTER_CONFLICT_STATUSES = ["open", "resolved", "overridden"] as const;
export const ROSTER_CONFLICT_TYPES = [
  "overlapping_shift",
  "employee_on_leave",
  "employee_inactive",
  "employee_terminated",
  "employee_suspended",
  "outside_contract",
  "holiday_conflict",
  "holiday_roster_warning",
  "holiday_roster_blocked",
  "payroll_locked_period",
  "attendance_locked_period",
] as const;

export const DEFAULT_ROSTER_SETTINGS = {
  roster_module_enabled: true,
  allow_roster_overlap_override: false,
  allow_scheduling_on_leave: false,
  allow_scheduling_on_holidays: true,
  allow_scheduling_suspended_employee: false,
  require_publish_before_attendance: false,
  roster_publish_required: false,
  default_shift_break_minutes: 0,
  roster_conflict_warning_days: 30,
};

export const APPROVED_LEAVE_STATUSES = ["approved", "auto_approved", "direct_approved"] as const;
export const LEAVING_STATUSES = ["terminated", "resigned", "retired", "inactive"] as const;
