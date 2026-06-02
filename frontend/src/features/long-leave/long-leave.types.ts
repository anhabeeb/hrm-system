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
  final_payable_amount?: number | null;
  override_amount?: number | null;
  status?: string;
  payroll_status?: string;
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
  leave_request_id: string;
  start_date: string;
  expected_return_date: string;
  reason: string;
  allow_short_leave_override?: boolean;
}
