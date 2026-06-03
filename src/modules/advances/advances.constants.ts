export const ADVANCE_STATUSES = ["pending", "approved", "rejected"] as const;
export const ADVANCE_AUDIT_ACTIONS = {
  created: "advance_created",
  updated: "advance_updated",
  approved: "advance_approved",
  rejected: "advance_rejected",
} as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
