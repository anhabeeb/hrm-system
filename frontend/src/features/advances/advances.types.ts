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

export type AdvanceSalaryRequestStatus =
  | "DRAFT"
  | "PENDING"
  | "PENDING_OWNER_REVIEW"
  | "PENDING_FINAL_APPROVAL"
  | "PENDING_PAYMENT"
  | "PENDING_MANUAL_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "PAID"
  | "PARTIALLY_DEDUCTED"
  | "FULLY_DEDUCTED"
  | "FAILED_TO_PAY";

export interface AdvanceSalaryRequest {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  outlet_name?: string | null;
  request_type: string;
  requested_amount: number;
  approved_amount?: number | null;
  paid_amount?: number | null;
  outstanding_amount?: number | null;
  currency?: string | null;
  requested_payment_date?: string | null;
  repayment_start_month?: string | null;
  repayment_months?: number | null;
  repayment_amount_per_month?: number | null;
  reason: string;
  employee_note?: string | null;
  status: AdvanceSalaryRequestStatus;
  payment_status?: string | null;
  deduction_status?: string | null;
  approval_request_id?: string | null;
  approval_status?: string | null;
  approval_current_step?: string | null;
  current_step_name?: string | null;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  payment_error_message?: string | null;
  actual_payment_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdvanceSalaryPayload {
  employee_id?: string;
  request_type: string;
  requested_amount: number;
  currency?: string;
  requested_payment_date?: string;
  repayment_start_month?: string;
  repayment_months?: number;
  reason: string;
  employee_note?: string;
  repayment_policy_json?: Record<string, unknown>;
}
