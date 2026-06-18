export interface LeaveRequest {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  leave_type_id?: string;
  leave_type_name?: string;
  start_date?: string;
  end_date?: string;
  total_days?: number;
  status: string;
  affects_payroll?: boolean | number;
  reason?: string | null;
  requested_by?: string | null;
  requested_by_name?: string | null;
  approval_request_id?: string | null;
  approval_status?: string | null;
  approval_current_step?: string | null;
  approval_submitted_at?: string | null;
  approval_completed_at?: string | null;
  department_approved_at?: string | null;
  department_approved_by?: string | null;
  hr_approved_at?: string | null;
  hr_approved_by?: string | null;
  rejection_reason?: string | null;
  current_step_id?: string | null;
  current_step_order?: number | null;
  approver_type?: string | null;
  required_permission_key?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  withdrawn_at?: string | null;
  document_required?: boolean | number;
  document_status?: string | null;
  document_required_reason?: string | null;
  policy_rule_id?: string | null;
  policy_snapshot_json?: string | null;
  created_at?: string;
}

export interface LeaveApprovalStep {
  id: string;
  leave_request_id: string;
  step_order: number;
  approver_type: string;
  approver_user_id?: string | null;
  approver_role_key?: string | null;
  required_permission_key?: string | null;
  status: string;
  decision_by?: string | null;
  decision_at?: string | null;
  decision_note?: string | null;
  delegated_to?: string | null;
}

export interface LeaveTimelineItem {
  type: string;
  at?: string | null;
  by?: string | null;
  note?: string | null;
  step_order?: number;
  quantity_days?: number;
  balance_after?: number;
}

export interface LeaveApprovalDetail {
  leave_request: LeaveRequest;
  generic_approval_request?: {
    id: string;
    status?: string;
    current_step?: number | string | null;
  } | null;
  engine_approval_request?: {
    id: string;
    status: string;
    current_step_id?: string | null;
    current_step_name?: string | null;
  } | null;
  approval_steps: LeaveApprovalStep[];
  balance_transactions: LeaveBalanceTransaction[];
  timeline: LeaveTimelineItem[];
}

export interface LeaveBalance {
  id?: string;
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  leave_type_id: string;
  leave_type_name?: string;
  year: number;
  opening_balance?: number;
  accrued_days?: number;
  used_days?: number;
  pending_days?: number;
  adjusted_days?: number;
  carried_forward_days?: number;
  expired_days?: number;
  available_days?: number;
  calculated_available_days?: number;
  entitlement_days?: number;
  remaining_days?: number;
  last_accrual_date?: string | null;
  next_accrual_date?: string | null;
  status?: string;
}

export interface LeaveBalanceTransaction {
  id: string;
  employee_id: string;
  employee_name?: string;
  leave_type_id: string;
  leave_type_name?: string;
  transaction_type: string;
  quantity_days: number;
  balance_before: number;
  balance_after: number;
  effective_date: string;
  source: string;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface LeaveType {
  id: string;
  name?: string;
  leave_type_name?: string;
  code?: string;
  leave_key?: string;
  default_days?: number | null;
  is_enabled?: boolean | number;
  is_statutory?: boolean | number;
  is_paid?: boolean | number;
  affects_payroll?: boolean | number;
  requires_balance?: boolean | number;
  allow_negative_balance?: boolean | number;
  max_negative_balance?: number | null;
  accrual_enabled?: boolean | number;
  accrual_frequency?: string;
  annual_entitlement_days?: number | null;
  accrual_amount?: number | null;
  prorate_on_joining?: boolean | number;
  prorate_on_termination?: boolean | number;
  carry_forward_enabled?: boolean | number;
  carry_forward_limit_days?: number | null;
  carry_forward_expiry_month?: number | null;
  carry_forward_expiry_day?: number | null;
  half_day_enabled?: boolean | number;
  sort_order?: number;
  status?: string;
}

export interface LeaveTypeUpdatePayload {
  requires_balance?: boolean;
  allow_negative_balance?: boolean;
  max_negative_balance?: number | null;
  accrual_enabled?: boolean;
  accrual_frequency?: string;
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

export interface LeavePolicy {
  id: string;
  policy_name?: string;
  employee_type?: string | null;
  leave_type_id?: string;
  entitlement_days?: number;
  status?: string;
  effective_from?: string;
}

export interface LeaveTypePolicyRule {
  id: string;
  leave_type_id: string;
  leave_type_key?: string | null;
  leave_type_name?: string | null;
  leave_key?: string | null;
  annual_entitlement_days?: number | null;
  paid_status: "paid" | "partial_paid" | "unpaid" | string;
  paid_percentage: number;
  payroll_impact_enabled?: boolean | number;
  document_requirement: string;
  document_required_mode?: string;
  document_after_days?: number | null;
  document_required_after_consecutive_days?: number | null;
  document_after_used_days?: number | null;
  document_required_after_used_days?: number | null;
  allow_no_document_until_used_days?: number | null;
  require_document_for_backdated_request?: boolean | number;
  require_document_for_extension?: boolean | number;
  approval_required: boolean | number;
  approval_workflow_key?: string | null;
  salary_deduction_enabled: boolean | number;
  deduction_mode: string;
  deduction_component: string;
  deduction_component_keys_json?: string | null;
  deduction_pay_component_keys?: string | null;
  deduction_daily_rate_method?: string | null;
  deduction_custom_divisor?: number | null;
  payroll_source_label?: string | null;
  allow_half_day?: boolean | number;
  allow_carry_forward?: boolean | number;
  carry_forward_limit_days?: number | null;
  reset_period?: string | null;
  count_weekends?: boolean | number;
  count_public_holidays?: boolean | number;
  notes?: string | null;
  is_enabled: boolean | number;
}

export interface LeaveTypePolicyRuleUpdatePayload {
  paid_status?: "paid" | "partial_paid" | "unpaid";
  paid_percentage?: number;
  payroll_impact_enabled?: boolean;
  document_requirement?: string;
  document_required_mode?: string;
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
  annual_entitlement_days?: number | null;
  allow_half_day?: boolean;
  allow_carry_forward?: boolean;
  carry_forward_limit_days?: number | null;
  reset_period?: string | null;
  count_weekends?: boolean;
  count_public_holidays?: boolean;
  notes?: string | null;
  is_enabled?: boolean;
  reason: string;
}

export interface LeaveFilters {
  search?: string;
  outlet_id?: string;
  employee_id?: string;
  leave_type_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  employee_type?: string;
  department_id?: string;
  year?: number;
  page?: number;
  page_size?: number;
  as_of_date?: string;
}

export interface LeaveRequestPayload {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
  supporting_document_id?: string | null;
  supporting_document_attached?: boolean;
}

export interface LeavePolicyPreview {
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
  document_reason?: string | null;
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

export interface LeaveDelegatePayload {
  delegated_to: string;
  reason: string;
}

export interface LeaveBalanceAdjustPayload {
  employee_id?: string;
  leave_type_id: string;
  year: number;
  adjustment_days: number;
  reason: string;
}

export interface LeaveOpeningBalancePayload {
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  reason: string;
}

export interface LeaveCarryForwardPayload {
  employee_id: string;
  leave_type_id: string;
  source_year: number;
  destination_year: number;
  reason: string;
}

export interface LeaveExpiryPayload {
  employee_id: string;
  leave_type_id: string;
  year: number;
  expiry_days: number;
  effective_date: string;
  reason: string;
}

export interface LeaveAccrualPayload {
  as_of_date: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  leave_type_id?: string;
  reason?: string;
}

export interface LeaveAccrualRow {
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  leave_type_id: string;
  leave_type_name?: string;
  period_key: string;
  current_balance: number;
  accrual_amount: number;
  resulting_balance: number;
  skipped?: boolean;
  skipped_reason?: string | null;
  transaction_id?: string;
}

export interface LeaveAccrualResult {
  rows?: LeaveAccrualRow[];
  applied?: LeaveAccrualRow[];
  skipped?: LeaveAccrualRow[];
  summary?: Record<string, number>;
}
