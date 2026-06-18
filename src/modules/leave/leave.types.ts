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

export type LeavePolicyPaidStatus = "paid" | "partial_paid" | "partially_paid" | "unpaid";
export type LeavePolicyDocumentRequirement =
  | "never"
  | "always"
  | "after_consecutive_days"
  | "after_used_days"
  | "after_consecutive_or_used_days"
  | "custom";

export interface LeaveTypePolicyRuleRecord {
  id: string;
  company_id: string;
  leave_type_id: string;
  leave_type_key?: string | null;
  leave_type_name?: string | null;
  leave_key?: string | null;
  annual_entitlement_days: number | null;
  paid_status: LeavePolicyPaidStatus | string;
  paid_percentage: number;
  payroll_impact_enabled?: number;
  document_requirement: LeavePolicyDocumentRequirement | string;
  document_required_mode?: LeavePolicyDocumentRequirement | string;
  document_after_days: number | null;
  document_required_after_consecutive_days?: number | null;
  document_after_used_days: number | null;
  document_required_after_used_days?: number | null;
  allow_no_document_until_used_days?: number | null;
  require_document_for_backdated_request?: number;
  require_document_for_extension?: number;
  approval_required: number;
  approval_workflow_key?: string | null;
  salary_deduction_enabled: number;
  deduction_mode: string;
  deduction_component: string;
  deduction_component_keys_json: string | null;
  deduction_pay_component_keys?: string | null;
  deduction_daily_rate_method?: string | null;
  deduction_custom_divisor?: number | null;
  payroll_source_label: string | null;
  allow_half_day?: number;
  allow_carry_forward?: number;
  carry_forward_limit_days?: number | null;
  reset_period?: string | null;
  count_weekends?: number;
  count_public_holidays?: number;
  notes?: string | null;
  is_enabled: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface LeaveTypePolicyRuleUpdateInput {
  paid_status?: LeavePolicyPaidStatus;
  annual_entitlement_days?: number | null;
  paid_percentage?: number;
  payroll_impact_enabled?: boolean;
  document_requirement?: LeavePolicyDocumentRequirement;
  document_required_mode?: LeavePolicyDocumentRequirement;
  document_after_days?: number | null;
  document_required_after_consecutive_days?: number | null;
  document_after_used_days?: number | null;
  document_required_after_used_days?: number | null;
  allow_no_document_until_used_days?: number | null;
  require_document_for_backdated_request?: boolean;
  require_document_for_extension?: boolean;
  approval_required?: boolean;
  approval_workflow_key?: string | null;
  salary_deduction_enabled?: boolean;
  deduction_mode?: string;
  deduction_component?: string;
  deduction_component_keys_json?: string | null;
  deduction_pay_component_keys?: string | null;
  deduction_daily_rate_method?: string | null;
  deduction_custom_divisor?: number | null;
  payroll_source_label?: string | null;
  allow_half_day?: boolean;
  allow_carry_forward?: boolean;
  carry_forward_limit_days?: number | null;
  reset_period?: string | null;
  count_weekends?: boolean;
  count_public_holidays?: boolean;
  notes?: string | null;
  updated_by?: string | null;
  is_enabled?: boolean;
  reason: string;
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
  approval_current_step?: string | null;
  approval_submitted_at?: string | null;
  approval_completed_at?: string | null;
  department_approved_at?: string | null;
  department_approved_by?: string | null;
  hr_approved_at?: string | null;
  hr_approved_by?: string | null;
  rejection_reason?: string | null;
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
  document_required?: number;
  document_status?: "not_required" | "missing" | "submitted" | "approved" | "rejected" | string;
  document_required_reason?: string | null;
  policy_rule_id?: string | null;
  policy_snapshot_json?: string | null;
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
  level?: number | null;
  employment_status: string;
  deleted_at: string | null;
  archived_at?: string | null;
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
  supporting_document_id?: string | null;
  supporting_document_attached?: boolean;
}

export type LeaveRequestUpdateInput = Partial<LeaveRequestInput> & {
  reason?: string | null;
};

export interface LeavePolicyPreviewInput extends LeaveRequestInput {
  is_extension?: boolean;
  is_backdated?: boolean;
}

export interface LeavePolicyEvaluationResult {
  leave_type_id: string;
  leave_type_name: string;
  rule_id: string | null;
  requested_days: number;
  used_days_in_year: number;
  paid_status: string;
  paid_percentage: number;
  approval_required: boolean;
  document_required: boolean;
  document_requirement: string;
  document_reason: string | null;
  salary_deduction_required: boolean;
  deductible_days: number;
  deduction_mode: string;
  deduction_component: string;
  deduction_component_keys_json?: string | null;
  payroll_source_label: string;
  deduction_source_label?: string;
  warnings: string[];
  blocking_errors: string[];
}

export interface LeaveActionInput {
  reason: string;
}

export interface LeaveDelegateInput {
  delegated_to: string;
  reason: string;
}
