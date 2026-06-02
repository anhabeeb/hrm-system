export interface AdvancePayment {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  amount?: number;
  paid_date?: string;
  deduction_month?: string;
  status?: string;
  requested_by?: string;
  created_at?: string;
}

export interface AdvanceFilters {
  outlet_id?: string;
  employee_id?: string;
  status?: string;
  deduction_month?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface AdvancePayload {
  employee_id: string;
  amount: number;
  paid_date: string;
  deduction_month: string;
  reason: string;
}
