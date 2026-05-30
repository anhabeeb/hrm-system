export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const UNIFORM_STATUSES = ["issued", "returned"] as const;

export const UNIFORM_AUDIT_ACTIONS = {
  issued: "uniform_issued",
  returned: "uniform_returned",
  updated: "uniform_updated",
} as const;
