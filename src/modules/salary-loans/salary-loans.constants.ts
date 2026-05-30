export const SALARY_LOAN_STATUSES = ["pending", "approved", "active", "paused", "settled", "rejected"] as const;
export const SALARY_LOAN_AUDIT_ACTIONS = {
  created: "salary_loan_created",
  updated: "salary_loan_updated",
  approved: "salary_loan_approved",
  paused: "salary_loan_paused",
  settled: "salary_loan_settled",
} as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
