import type { PaginationMeta } from "../../types/api.types";

export interface LeaveOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface LeaveTypeRecord {
  id: string;
  company_id: string;
  leave_key: string;
  leave_name: string;
  is_statutory: number;
  is_enabled: number;
  is_paid: number;
  default_days: number | null;
  requires_attachment: number;
  affects_payroll: number;
  requires_balance?: number;
  allow_negative_balance?: number;
  max_negative_balance?: number;
  accrual_enabled?: number;
  accrual_frequency?: "none" | "monthly" | "yearly" | "daily" | "custom" | string;
  annual_entitlement_days?: number | null;
  accrual_amount?: number | null;
  prorate_on_joining?: number;
  prorate_on_termination?: number;
  carry_forward_enabled?: number;
  carry_forward_limit_days?: number | null;
  carry_forward_expiry_month?: number | null;
  carry_forward_expiry_day?: number | null;
  half_day_enabled?: number;
  sort_order?: number;
  is_protected?: number;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicyRecord {
  id: string;
  company_id: string;
  policy_name: string;
  employee_type: string | null;
  leave_type_id: string;
  entitlement_days: number;
  carry_forward_days: number | null;
  allow_negative_balance: number;
  max_continuous_days: number | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  accrued_days: number;
  used_days: number;
  pending_days?: number;
  adjusted_days?: number;
  carried_forward_days?: number;
  expired_days?: number;
  available_days?: number;
  entitlement_days?: number;
  remaining_days: number;
  policy_year?: number | null;
  accrual_period_start?: string | null;
  accrual_period_end?: string | null;
  last_accrual_date?: string | null;
  next_accrual_date?: string | null;
  status?: string;
  created_at?: string | null;
  updated_at: string;
}

export type LeaveBalanceTransactionType =
  | "opening_balance"
  | "accrual"
  | "request_reserved"
  | "request_released"
  | "leave_used"
  | "manual_adjustment"
  | "carry_forward"
  | "expiry"
  | "correction"
  | "reversal";

export interface LeaveBalanceTransactionRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  balance_id: string;
  leave_request_id: string | null;
  transaction_type: LeaveBalanceTransactionType;
  quantity_days: number;
  balance_before: number;
  balance_after: number;
  effective_date: string;
  reason: string | null;
  source: "system" | "leave_request" | "accrual_job" | "manual_adjustment" | "import" | "correction" | string;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface LeaveRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  created_by: string | null;
  approval_request_id: string | null;
  approval_status?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  withdrawn_at?: string | null;
  withdrawn_by?: string | null;
  decision_reason?: string | null;
  affects_payroll: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveApprovalStepRecord {
  id: string;
  company_id: string;
  leave_request_id: string;
  step_order: number;
  approver_type: "user" | "role" | "manager" | "department_manager" | "outlet_manager" | "super_admin_fallback" | string;
  approver_user_id: string | null;
  approver_role_id: string | null;
  approver_role_key: string | null;
  required_permission_key: string | null;
  status: "pending" | "approved" | "rejected" | "skipped" | "delegated" | "expired" | string;
  decision_by: string | null;
  decision_at: string | null;
  decision_note: string | null;
  delegated_to: string | null;
  delegated_by: string | null;
  delegated_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveEmployeeRecord {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  date_of_joining?: string | null;
  hire_date?: string | null;
  joined_at?: string | null;
  exit_date?: string | null;
  termination_date?: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  employment_status: string;
  deleted_at: string | null;
}

export interface LeaveListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface LeaveTypeFilters {
  is_enabled?: string;
  is_statutory?: string;
  is_paid?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface LeavePolicyFilters {
  employee_type?: string;
  leave_type_id?: string;
  status?: string;
  effective_from?: string;
  page: number;
  page_size: number;
}

export interface LeaveBalanceFilters {
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  leave_type_id?: string;
  year?: number;
  status?: string;
  page: number;
  page_size: number;
}

export interface LeaveBalanceTransactionFilters {
  employee_id: string;
  leave_type_id?: string;
  year?: number;
  transaction_type?: string;
  page: number;
  page_size: number;
}

export interface LeaveRequestFilters {
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  leave_type_id?: string;
  date_from?: string;
  date_to?: string;
  employee_type?: string;
  approval_status?: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
}

export interface LeaveApprovalFilters extends LeaveRequestFilters {
  current_user_only?: boolean;
}

export interface LeaveCalendarFilters {
  date_from?: string;
  date_to?: string;
  outlet_id?: string;
  employee_id?: string;
  leave_type_id?: string;
  status?: string;
}

export interface LeaveTypeUpdateInput {
  is_enabled?: boolean;
  is_paid?: boolean;
  default_days?: number | null;
  requires_attachment?: boolean;
  affects_payroll?: boolean;
  requires_balance?: boolean;
  allow_negative_balance?: boolean;
  max_negative_balance?: number | null;
  accrual_enabled?: boolean;
  accrual_frequency?: "none" | "monthly" | "yearly" | "daily" | "custom" | string;
  annual_entitlement_days?: number | null;
  accrual_amount?: number | null;
  prorate_on_joining?: boolean;
  prorate_on_termination?: boolean;
  carry_forward_enabled?: boolean;
  carry_forward_limit_days?: number | null;
  carry_forward_expiry_month?: number | null;
  carry_forward_expiry_day?: number | null;
  half_day_enabled?: boolean;
  sort_order?: number;
  reason: string;
}

export interface LeavePolicyInput {
  policy_name: string;
  employee_type?: string | null;
  leave_type_id: string;
  entitlement_days: number;
  carry_forward_days?: number;
  allow_negative_balance?: boolean;
  max_continuous_days?: number | null;
  effective_from: string;
  effective_to?: string | null;
  status?: string;
  reason: string;
}

export type LeavePolicyUpdateInput = Partial<Omit<LeavePolicyInput, "reason">> & {
  reason: string;
};

export interface LeaveBalanceAdjustInput {
  leave_type_id: string;
  year: number;
  adjustment_days: number;
  reason: string;
}

export interface LeaveOpeningBalanceInput {
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  reason: string;
}

export interface LeaveAccrualInput {
  as_of_date: string;
  employee_id?: string;
  leave_type_id?: string;
  outlet_id?: string;
  department_id?: string;
  preview?: boolean;
  reason?: string;
}

export interface LeaveCarryForwardInput {
  employee_id: string;
  leave_type_id: string;
  source_year: number;
  destination_year: number;
  reason: string;
}

export interface LeaveExpiryInput {
  employee_id: string;
  leave_type_id: string;
  year: number;
  expiry_days: number;
  effective_date: string;
  reason: string;
}

export interface LeaveRequestInput {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
}

export type LeaveRequestUpdateInput = Partial<LeaveRequestInput> & {
  reason?: string | null;
};

export interface LeaveActionInput {
  reason: string;
}

export interface LeaveDelegateInput {
  delegated_to: string;
  reason: string;
}
