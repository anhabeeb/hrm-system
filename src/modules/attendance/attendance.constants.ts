export const ATTENDANCE_EVENT_TYPES = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
  "manual_entry",
] as const;

export const ATTENDANCE_METHODS = [
  "manual",
  "pin",
  "qr",
  "kiosk",
  "biometric_placeholder",
  "import_placeholder",
] as const;

export const ATTENDANCE_SOURCES = [
  "admin_dashboard",
  "manager_dashboard",
  "kiosk",
  "biometric_placeholder",
  "import_placeholder",
  "sync_placeholder",
] as const;

export const ATTENDANCE_SUMMARY_STATUSES = [
  "present",
  "absent",
  "on_leave",
  "holiday",
  "off_day",
  "checked_in",
  "missing_clock_in",
  "missing_clock_out",
  "conflict",
] as const;

export const ATTENDANCE_CONFLICT_TYPES = [
  "duplicate_punch",
  "wrong_outlet",
  "missing_clock_in",
  "missing_clock_out",
  "inactive_employee",
  "manual_vs_device",
  "payroll_locked",
  "device_time_warning_placeholder",
] as const;

export const ATTENDANCE_SORT_FIELDS = [
  "attendance_date",
  "employee_code",
  "employee_name",
  "outlet_name",
  "status",
  "created_at",
  "updated_at",
] as const;
