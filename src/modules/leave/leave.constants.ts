export const LEAVE_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "pending_approval",
  "pending",
  "pending_document",
  "partially_approved",
  "approved",
  "direct_approved",
  "rejected",
  "cancelled",
  "withdrawn",
  "finalized",
  "taken",
  "expired",
  "returned_for_more_info",
] as const;

export const ACTIVE_LEAVE_STATUSES = ["submitted", "pending_approval", "pending", "pending_document", "partially_approved", "approved", "direct_approved", "finalized", "taken"] as const;

export const LEAVE_APPROVAL_STEP_STATUSES = ["pending", "approved", "rejected", "skipped", "delegated", "expired"] as const;

export const LEAVE_POLICY_STATUSES = ["active", "inactive"] as const;

export const LEAVE_AUDIT_ACTIONS = {
  typeUpdated: "leave_type_updated",
  policyCreated: "leave_policy_created",
  policyUpdated: "leave_policy_updated",
  balanceAdjusted: "leave_balance_adjusted",
  openingBalanceSet: "leave_opening_balance_set",
  accrualPreviewGenerated: "leave_accrual_preview_generated",
  accrualApplied: "leave_accrual_applied",
  carryForwardApplied: "leave_carry_forward_applied",
  leaveExpired: "leave_expired",
  balanceRebuilt: "leave_balance_rebuilt",
  requestCreated: "leave_request_created",
  requestUpdated: "leave_request_updated",
  requestSubmitted: "leave_request_submitted",
  requestAutoApproved: "leave_request_auto_approved",
  requestWithdrawn: "leave_request_withdrawn",
  requestApproved: "leave_request_approved",
  requestRejected: "leave_request_rejected",
  requestCancelled: "leave_request_cancelled",
  approvalStepCreated: "leave_approval_step_created",
  approvalStepApproved: "leave_approval_step_approved",
  approvalStepRejected: "leave_approval_step_rejected",
  approvalDelegated: "leave_approval_delegated",
  approvalEscalated: "leave_approval_escalated",
  approvalOverride: "leave_approval_super_admin_override",
  approvalSettingsUpdated: "leave_approval_settings_updated",
} as const;

export const LOCKED_PAYROLL_STATUSES = ["finalizing", "finalized", "locked", "paid"] as const;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
