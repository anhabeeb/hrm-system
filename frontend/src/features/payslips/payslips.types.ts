export interface Payslip {
  id: string;
  payroll_run_id?: string;
  payroll_month?: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  status?: string;
  generated_at?: string | null;
  published_at?: string | null;
  created_at?: string;
}

export interface PayslipFilters {
  payroll_run_id?: string;
  payroll_month?: string;
  employee_id?: string;
  outlet_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}
