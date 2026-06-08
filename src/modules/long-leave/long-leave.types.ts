import type { PaginationMeta } from "../../types/api.types";

export interface LongLeaveOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface LongLeaveRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_request_id: string | null;
  start_date: string;
  expected_return_date: string;
  actual_return_date: string | null;
  total_days: number;
  status: string;
  approval_status?: string | null;
  payroll_status?: string | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  returned_by?: string | null;
  returned_at?: string | null;
  return_notes?: string | null;
  reason?: string | null;
  notes?: string | null;
  salary_treatment?: string | null;
  deduction_method?: string | null;
  payable_days_policy?: string | null;
  expected_return_date_original?: string | null;
  extended_from_long_leave_id?: string | null;
  created_by?: string | null;
  salary_impact_confirmed: number;
  created_at: string;
  updated_at: string;
}

export interface LongLeaveImpactRecord {
  id: string;
  company_id: string;
  employee_id: string;
  long_leave_record_id: string;
  payroll_month: string;
  monthly_salary_amount: number;
  salary_calculation_days: number;
  worked_days: number;
  long_leave_days: number;
  daily_salary_amount: number;
  estimated_payable_amount: number;
  final_payable_amount: number | null;
  override_amount: number | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LongLeaveEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  employment_status: string;
  deleted_at: string | null;
  date_of_joining?: string | null;
  hire_date?: string | null;
  joined_at?: string | null;
}

export interface LongLeaveFilters {
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface LongLeaveListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface LongLeaveCreateInput {
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
  is_enabled: number;
  applies_to_foreigners: number;
  applies_to_locals: number;
  trigger_days: number;
  max_continuous_days: number | null;
  salary_rule: string;
  require_salary_impact_preview: number;
  pay_only_worked_days: number;
  deduct_full_salary_if_zero_worked_days: number;
  count_holidays_inside_leave: number;
  pay_holidays_during_long_leave: number;
  pay_weekly_off_days_during_long_leave: number;
  allow_hr_override: number;
  default_salary_treatment?: string | null;
  default_deduction_method?: string | null;
  require_payroll_review?: number | null;
  require_return_to_work_confirmation?: number | null;
  approval_required?: number | null;
  partial_pay_ratio?: number | null;
}

export interface LongLeaveSettingsInput {
  is_enabled?: boolean;
  applies_to_foreigners?: boolean;
  applies_to_locals?: boolean;
  trigger_days?: number;
  max_continuous_days?: number | null;
  salary_rule?: string;
  require_salary_impact_preview?: boolean;
  pay_only_worked_days?: boolean;
  deduct_full_salary_if_zero_worked_days?: boolean;
  count_holidays_inside_leave?: boolean;
  pay_holidays_during_long_leave?: boolean;
  pay_weekly_off_days_during_long_leave?: boolean;
  allow_hr_override?: boolean;
  default_salary_treatment?: string;
  default_deduction_method?: string;
  require_payroll_review?: boolean;
  require_return_to_work_confirmation?: boolean;
  approval_required?: boolean;
  partial_pay_ratio?: number;
  reason: string;
}

export interface LongLeaveUpdateInput {
  start_date?: string;
  expected_return_date?: string;
  reason: string;
  notes?: string;
  salary_treatment?: string;
  deduction_method?: string;
  payable_days_policy?: string;
}

export interface LongLeaveActionInput {
  reason: string;
}

export interface LongLeaveReturnInput {
  actual_return_date: string;
  reason: string;
  return_notes?: string;
}

export interface LongLeaveExtendInput {
  new_expected_return_date: string;
  reason: string;
}

export interface LongLeaveOverrideInput {
  payroll_month: string;
  override_amount: number;
  reason: string;
}

export interface SalaryImpactCalculationRow {
  payroll_month: string;
  monthly_salary_amount: number;
  salary_calculation_days: number;
  worked_days: number;
  long_leave_days: number;
  daily_salary_amount: number;
  estimated_payable_amount: number;
  total_days?: number;
  payable_days?: number;
  unpaid_days?: number;
  holiday_days?: number;
  payable_holiday_days?: number;
  deduction_amount?: number;
  payable_salary?: number;
  status?: string;
  warning_code?: string | null;
  warning_message?: string | null;
}

export interface LongLeavePayrollImpactRecord {
  id: string;
  company_id: string;
  long_leave_id: string;
  employee_id: string;
  payroll_month: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  total_days: number;
  long_leave_days: number;
  holiday_days?: number;
  payable_holiday_days?: number;
  payable_days: number;
  unpaid_days: number;
  per_day_rate: number;
  deduction_amount: number;
  payable_salary: number;
  status: string;
  payroll_run_id: string | null;
  payroll_adjustment_id: string | null;
  calculated_at: string;
  applied_at: string | null;
  applied_by: string | null;
  idempotency_key: string;
  notes: string | null;
  metadata_json: string | null;
  warning_code?: string | null;
  warning_message?: string | null;
  created_at: string;
  updated_at: string;
}
