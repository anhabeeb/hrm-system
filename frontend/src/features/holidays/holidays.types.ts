export interface HolidayRecord {
  id: string;
  name: string;
  holiday_name?: string | null;
  code?: string | null;
  holiday_type: string;
  date: string;
  start_date?: string;
  end_date?: string | null;
  event_date?: string;
  outlet_id?: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  paid_holiday?: number | boolean;
  affects_leave_duration?: number | boolean;
  affects_attendance_absence?: number | boolean;
  affects_overtime?: number | boolean;
  affects_long_leave_payroll?: number | boolean;
  applies_to_local_employees?: number | boolean;
  applies_to_foreign_employees?: number | boolean;
  is_recurring?: number | boolean;
  status: string;
  notes?: string | null;
}

export interface HolidayFilters {
  year?: number;
  month?: number;
  from_date?: string;
  to_date?: string;
  outlet_id?: string;
  holiday_type?: string;
  status?: string;
  recurring?: boolean;
  employee_type?: string;
  page?: number;
  page_size?: number;
}

export interface HolidayPayload {
  name: string;
  code?: string;
  holiday_type: string;
  date: string;
  end_date?: string;
  outlet_id?: string;
  applies_to_all_outlets?: boolean;
  applies_to_local_employees?: boolean;
  applies_to_foreign_employees?: boolean;
  is_recurring?: boolean;
  paid_holiday?: boolean;
  affects_leave_duration?: boolean;
  affects_attendance_absence?: boolean;
  affects_overtime?: boolean;
  affects_long_leave_payroll?: boolean;
  notes?: string;
  reason: string;
}

export interface HolidaySettings {
  holiday_module_enabled?: number | boolean;
  public_holidays_enabled?: number | boolean;
  company_holidays_enabled?: number | boolean;
  outlet_specific_holidays_enabled?: number | boolean;
  optional_holidays_enabled?: number | boolean;
  holiday_leave_rules_enabled?: number | boolean;
  holiday_attendance_rules_enabled?: number | boolean;
  holiday_roster_rules_enabled?: number | boolean;
  holidays_exclude_from_paid_leave?: number | boolean;
  holidays_exclude_from_unpaid_leave?: number | boolean;
  pay_holidays_during_long_leave?: number | boolean;
  holidays_count_as_attendance_excused?: number | boolean;
  holiday_work_overtime_enabled?: number | boolean;
  replacement_holidays_enabled?: number | boolean;
  holiday_import_enabled?: number | boolean;
  require_reason_for_holiday_changes?: number | boolean;
  default_holiday_pay_multiplier?: number;
}

export interface HolidaySettingsPayload extends Partial<HolidaySettings> {
  reason: string;
}
