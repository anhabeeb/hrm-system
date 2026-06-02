export interface SalaryLoan {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  loan_amount?: number;
  outstanding_amount?: number;
  installment_amount?: number;
  installment_count?: number;
  start_month?: string;
  status?: string;
  created_at?: string;
}

export interface SalaryLoanInstallment {
  id: string;
  payroll_month?: string;
  amount?: number;
  paid_amount?: number;
  status?: string;
  payroll_status?: string;
}

export interface SalaryLoanFilters {
  outlet_id?: string;
  employee_id?: string;
  status?: string;
  start_month?: string;
  page?: number;
  page_size?: number;
}

export interface SalaryLoanPayload {
  employee_id: string;
  loan_amount: number;
  installment_amount: number;
  start_month: string;
  reason: string;
}
