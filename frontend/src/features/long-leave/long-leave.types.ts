export interface LongLeaveRecord {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  leave_request_id?: string;
  start_date?: string;
  expected_return_date?: string;
  actual_return_date?: string | null;
  status: string;
  reason?: string | null;
  salary_impact_confirmed?: boolean | number;
  approval_status?: string | null;
  payroll_status?: string | null;
  salary_treatment?: string | null;
  deduction_method?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface SalaryImpactRow {
  id?: string;
  payroll_month: string;
  monthly_salary_amount?: number;
  salary_calculation_days?: number;
  worked_days?: number;
  long_leave_days?: number;
  daily_salary_amount?: number;
  estimated_payable_amount?: number;
  total_days?: number;
  payable_days?: number;
  unpaid_days?: number;
  deduction_amount?: number;
  payable_salary?: number;
  per_day_rate?: number;
  base_salary?: number;
  final_payable_amount?: number | null;
  override_amount?: number | null;
  status?: string;
  payroll_status?: string;
  warning_code?: string | null;
  warning_message?: string | null;
  notes?: string | null;
}

export interface LongLeaveFilters {
  search?: string;
  outlet_id?: string;
  employee_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface LongLeavePayload {
  employee_id: string;
  leave_request_id?: string;
  start_date: string;
  expected_return_date: string;
  reason: string;
  notes?: string;
  salary_treatment?: string;
  deduction_method?: string;
  payable_days_policy?: string;
  allow_short_leave_override?: boolean;
  allow_local_override?: boolean;
}

export interface LongLeaveSettings {
  is_enabled: number | boolean;
  applies_to_foreigners: number | boolean;
  applies_to_locals: number | boolean;
  trigger_days: number;
  max_continuous_days?: number | null;
  salary_rule: string;
  pay_only_worked_days: number | boolean;
  count_holidays_inside_leave: number | boolean;
  pay_holidays_during_long_leave: number | boolean;
  pay_weekly_off_days_during_long_leave: number | boolean;
  require_salary_impact_preview: number | boolean;
  deduct_full_salary_if_zero_worked_days: number | boolean;
  allow_hr_override: number | boolean;
  require_payroll_review?: number | boolean | null;
  require_return_to_work_confirmation?: number | boolean | null;
  approval_required?: number | boolean | null;
  default_salary_treatment?: string | null;
  default_deduction_method?: string | null;
  partial_pay_ratio?: number | null;
}

export interface LongLeaveSettingsPayload extends Partial<LongLeaveSettings> {
  reason: string;
}
