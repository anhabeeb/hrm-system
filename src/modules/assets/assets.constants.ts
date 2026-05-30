export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const ASSET_STATUSES = ["available", "issued", "returned", "lost", "damaged"] as const;
export const ASSET_CONDITIONS = ["new", "good", "fair", "damaged", "lost"] as const;
export const ASSET_DEDUCTION_STATUSES = ["pending", "approved", "rejected"] as const;

export const ASSET_AUDIT_ACTIONS = {
  created: "asset_created",
  updated: "asset_updated",
  assigned: "asset_assigned",
  returned: "asset_returned",
  markedLost: "asset_marked_lost",
  markedDamaged: "asset_marked_damaged",
  deductionRequested: "asset_deduction_requested",
  deductionApproved: "asset_deduction_approved",
  deductionRejected: "asset_deduction_rejected",
} as const;
