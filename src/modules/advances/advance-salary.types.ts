import type { PaginationMeta } from "../../types/api.types";

export const ADVANCE_SALARY_REQUEST_OPERATION = "ADVANCE_SALARY_REQUEST" as const;
export const ADVANCE_SALARY_PAYMENT_OPERATION = "ADVANCE_SALARY_PAYMENT" as const;
export const ADVANCE_SALARY_SUBJECT_TYPE = "ADVANCE_SALARY_REQUEST" as const;

export const ADVANCE_SALARY_REQUEST_TYPES = [
  "SALARY_ADVANCE",
  "EMERGENCY_ADVANCE",
  "MEDICAL_ADVANCE",
  "TRAVEL_ADVANCE",
  "FESTIVAL_ADVANCE",
  "LOAN_ADVANCE",
  "OTHER_ADVANCE",
] as const;

export const ADVANCE_SALARY_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_PAYMENT",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "PAID",
  "PARTIALLY_DEDUCTED",
  "FULLY_DEDUCTED",
  "FAILED_TO_PAY",
] as const;

export const ADVANCE_SALARY_PAYMENT_STATUSES = ["NOT_READY", "PENDING_PAYMENT", "PAID", "FAILED", "CANCELLED"] as const;
export const ADVANCE_SALARY_DEDUCTION_STATUSES = ["NOT_SCHEDULED", "SCHEDULED", "PARTIALLY_DEDUCTED", "FULLY_DEDUCTED", "CANCELLED"] as const;

export type AdvanceSalaryRequestType = (typeof ADVANCE_SALARY_REQUEST_TYPES)[number];
export type AdvanceSalaryStatus = (typeof ADVANCE_SALARY_STATUSES)[number];
export type AdvanceSalaryPaymentStatus = (typeof ADVANCE_SALARY_PAYMENT_STATUSES)[number];
export type AdvanceSalaryDeductionStatus = (typeof ADVANCE_SALARY_DEDUCTION_STATUSES)[number];

export interface AdvanceSalaryEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string | null;
  full_name: string;
  employment_status: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface AdvanceSalaryRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  outlet_id: string | null;
  payroll_month: string | null;
  payroll_year: number | null;
  request_type: AdvanceSalaryRequestType;
  requested_amount: number;
  approved_amount: number | null;
  paid_amount: number | null;
  outstanding_amount: number | null;
  currency: string | null;
  requested_payment_date: string | null;
  approved_payment_date: string | null;
  actual_payment_date: string | null;
  repayment_start_month: string | null;
  repayment_start_year: number | null;
  repayment_months: number | null;
  repayment_amount_per_month: number | null;
  repayment_policy_json: string | null;
  reason: string;
  employee_note: string | null;
  owner_note: string | null;
  final_approver_note: string | null;
  payment_note: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  status: AdvanceSalaryStatus;
  payment_status: AdvanceSalaryPaymentStatus;
  deduction_status: AdvanceSalaryDeductionStatus;
  current_step_name?: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
  outlet_name?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  owner_reviewed_at: string | null;
  owner_reviewed_by: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  payment_executed_at: string | null;
  payment_executed_by: string | null;
  payment_error_code: string | null;
  payment_error_message: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface AdvanceSalaryFilters {
  employee_id?: string;
  department_id?: string;
  outlet_id?: string;
  request_type?: AdvanceSalaryRequestType;
  status?: AdvanceSalaryStatus;
  payment_status?: AdvanceSalaryPaymentStatus;
  deduction_status?: AdvanceSalaryDeductionStatus;
  approval_status?: string;
  payroll_month?: string;
  page: number;
  page_size: number;
}

export interface AdvanceSalaryInput {
  employee_id?: string | null;
  request_type: AdvanceSalaryRequestType;
  requested_amount: number;
  currency?: string | null;
  requested_payment_date?: string | null;
  repayment_start_month?: string | null;
  repayment_months?: number | null;
  reason: string;
  employee_note?: string | null;
  repayment_policy_json?: Record<string, unknown> | null;
}

export interface AdvanceSalaryActionInput {
  reason: string;
  notes?: string | null;
}

export interface AdvanceSalaryPaymentInput {
  reason: string;
  payment_date?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  bank_name?: string | null;
}

export interface AdvanceSalaryListResult {
  rows: AdvanceSalaryRequestRecord[];
  pagination: PaginationMeta;
}
