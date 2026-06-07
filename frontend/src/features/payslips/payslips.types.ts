export interface Payslip {
  id: string;
  payroll_run_id?: string;
  payroll_item_id?: string;
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
  finalized_at?: string | null;
  calculation_version?: number | null;
  downloaded_at?: string | null;
  last_downloaded_at?: string | null;
  last_printed_at?: string | null;
  download_count?: number;
  printed_count?: number;
  company?: Record<string, unknown>;
  employee?: Record<string, unknown>;
  payroll_period?: Record<string, unknown>;
  earnings?: PayslipLine[];
  deductions?: PayslipLine[];
  non_cash_benefits?: PayslipLine[];
  totals?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  print_url?: string;
  download_url?: string;
}

export interface PayslipLine {
  id?: string;
  type?: string;
  amount?: number;
  source_type?: string | null;
  source_id?: string | null;
  source_reference?: string | null;
  calculation_code?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
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
