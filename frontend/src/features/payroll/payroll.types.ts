export interface PayrollRun {
  id: string;
  payroll_month: string;
  status: string;
  totals_scope?: string;
  payroll_year?: number;
  payroll_month_number?: number;
  period_start?: string;
  period_end?: string;
  currency?: string;
  calculation_status?: string;
  calculation_version?: number;
  calculated_at?: string | null;
  approval_request_id?: string | null;
  submitted_for_approval_at?: string | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
  finalization_started_at?: string | null;
  finalization_failed_reason?: string | null;
  employee_count?: number;
  item_count?: number;
  exception_count?: number;
  total_gross_amount?: number;
  total_deduction_amount?: number;
  total_net_amount?: number;
  gross_amount?: number;
  deductions_amount?: number;
  net_amount?: number;
  created_at?: string;
  locked_at?: string | null;
}

export interface PayrollItem {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  gross_amount?: number;
  total_earnings_amount?: number;
  total_deductions_amount?: number;
  net_amount?: number;
  status?: string;
  payslip_status?: string;
  calculation_code?: string | null;
  calculation_description?: string | null;
  calculation_metadata_json?: string | null;
}

export interface PayrollException {
  id: string;
  employee_id?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  exception_type?: string;
  severity?: string;
  status?: string;
  message?: string;
  created_at?: string;
}

export interface PayrollFilters {
  payroll_month?: string;
  outlet_id?: string;
  employee_id?: string;
  status?: string;
  severity?: string;
  exception_type?: string;
  page?: number;
  page_size?: number;
}

export interface PayrollCalculatePayload {
  payroll_month: string;
  outlet_id?: string;
  reason?: string;
}
