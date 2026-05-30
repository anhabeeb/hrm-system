export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const APPROVAL_STATUSES = ["pending", "in_progress", "approved", "rejected", "returned", "returned_for_more_info", "cancelled"] as const;
export const TERMINAL_APPROVAL_STATUSES = ["approved", "rejected", "returned", "returned_for_more_info", "cancelled"] as const;
export const APPROVAL_ACTIONS = ["approve", "reject", "return", "override"] as const;
export const APPROVAL_MODES = ["disabled", "manual", "auto_admin_superadmin", "full_workflow"] as const;

export const APPROVAL_AUDIT_ACTIONS = {
  created: "approval_request_created",
  approved: "approval_request_approved",
  stepApproved: "approval_step_approved",
  rejected: "approval_request_rejected",
  returned: "approval_request_returned",
  overridden: "approval_request_overridden",
  workflowCreated: "approval_workflow_created",
  workflowUpdated: "approval_workflow_updated",
  workflowEnabled: "approval_workflow_enabled",
  workflowDisabled: "approval_workflow_disabled",
  stepCreated: "approval_step_created",
  stepUpdated: "approval_step_updated",
  stepDeleted: "approval_step_deleted",
  thresholdCreated: "approval_threshold_created",
  thresholdUpdated: "approval_threshold_updated",
  thresholdEnabled: "approval_threshold_enabled",
  thresholdDisabled: "approval_threshold_disabled",
} as const;
