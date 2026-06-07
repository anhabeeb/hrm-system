export const LEAVE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "direct_approved",
  "rejected",
  "cancelled",
  "returned_for_more_info",
] as const;

export const ACTIVE_LEAVE_STATUSES = ["pending", "approved", "direct_approved"] as const;

export const LEAVE_POLICY_STATUSES = ["active", "inactive"] as const;

export const LEAVE_AUDIT_ACTIONS = {
  typeUpdated: "leave_type_updated",
  policyCreated: "leave_policy_created",
  policyUpdated: "leave_policy_updated",
  balanceAdjusted: "leave_balance_adjusted",
  requestCreated: "leave_request_created",
  requestUpdated: "leave_request_updated",
  requestApproved: "leave_request_approved",
  requestRejected: "leave_request_rejected",
  requestCancelled: "leave_request_cancelled",
} as const;

export const LOCKED_PAYROLL_STATUSES = ["finalizing", "finalized", "locked", "paid"] as const;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
