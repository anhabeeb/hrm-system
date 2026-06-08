export type HolidayStatus = "active" | "inactive" | "archived";

export interface HolidayRecord {
  id: string;
  company_id: string;
  name: string;
  holiday_name?: string | null;
  code?: string | null;
  holiday_type: string;
  date: string;
  start_date: string;
  end_date?: string | null;
  is_recurring: number;
  repeat_yearly?: number | null;
  recurrence_rule?: string | null;
  recurrence_month?: number | null;
  recurrence_day?: number | null;
  outlet_id?: string | null;
  department_id?: string | null;
  applies_to_all_outlets: number;
  applies_to_local_employees: number;
  applies_to_foreign_employees: number;
  paid_holiday: number;
  is_paid?: number | null;
  counts_as_working_day: number;
  affects_leave_duration: number;
  affects_attendance_absence: number;
  affects_overtime: number;
  affects_long_leave_payroll: number;
  affects_leave?: number | null;
  affects_attendance?: number | null;
  affects_roster?: number | null;
  requires_work_pay_rate_multiplier?: number | null;
  status: HolidayStatus;
  is_enabled?: number | null;
  source: string;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  archived_by?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HolidayEvent extends HolidayRecord {
  event_date: string;
  display_name: string;
}

export interface HolidaySettings {
  company_id?: string;
  holiday_module_enabled: number;
  public_holidays_enabled: number;
  company_holidays_enabled: number;
  outlet_specific_holidays_enabled: number;
  optional_holidays_enabled: number;
  other_holidays_enabled: number;
  holiday_leave_rules_enabled: number;
  holiday_attendance_rules_enabled: number;
  holiday_roster_rules_enabled: number;
  holidays_exclude_from_paid_leave: number;
  holidays_exclude_from_unpaid_leave: number;
  exclude_holidays_from_leave: number;
  pay_holidays_during_long_leave: number;
  holidays_count_as_attendance_excused: number;
  holiday_work_overtime_enabled: number;
  replacement_holidays_enabled: number;
  holiday_import_enabled: number;
  holiday_approval_required: number;
  require_reason_for_holiday_changes: number;
  default_holiday_pay_multiplier: number;
}

export interface HolidayFilters {
  date?: string;
  from_date?: string;
  to_date?: string;
  year?: number;
  month?: number;
  outlet_id?: string;
  department_id?: string;
  holiday_type?: string;
  status?: string;
  recurring?: boolean;
  employee_type?: "local" | "foreign";
  page: number;
  page_size: number;
}

export interface HolidayInput {
  name: string;
  code?: string | null;
  holiday_type: string;
  date: string;
  end_date?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  recurrence_month?: number | null;
  recurrence_day?: number | null;
  outlet_id?: string | null;
  department_id?: string | null;
  applies_to_all_outlets?: boolean;
  applies_to_local_employees?: boolean;
  applies_to_foreign_employees?: boolean;
  paid_holiday?: boolean;
  counts_as_working_day?: boolean;
  affects_leave_duration?: boolean;
  affects_attendance_absence?: boolean;
  affects_overtime?: boolean;
  affects_long_leave_payroll?: boolean;
  requires_work_pay_rate_multiplier?: number | null;
  status?: HolidayStatus;
  notes?: string | null;
  reason?: string;
}

export interface HolidaySettingsInput {
  holiday_module_enabled?: boolean;
  public_holidays_enabled?: boolean;
  company_holidays_enabled?: boolean;
  outlet_specific_holidays_enabled?: boolean;
  optional_holidays_enabled?: boolean;
  other_holidays_enabled?: boolean;
  holiday_leave_rules_enabled?: boolean;
  holiday_attendance_rules_enabled?: boolean;
  holiday_roster_rules_enabled?: boolean;
  holidays_exclude_from_paid_leave?: boolean;
  holidays_exclude_from_unpaid_leave?: boolean;
  exclude_holidays_from_leave?: boolean;
  pay_holidays_during_long_leave?: boolean;
  holidays_count_as_attendance_excused?: boolean;
  holiday_work_overtime_enabled?: boolean;
  replacement_holidays_enabled?: boolean;
  holiday_import_enabled?: boolean;
  holiday_approval_required?: boolean;
  require_reason_for_holiday_changes?: boolean;
  default_holiday_pay_multiplier?: number;
  reason: string;
}

export interface HolidayCheckInput {
  date: string;
  employee_id?: string;
  outlet_id?: string | null;
}
