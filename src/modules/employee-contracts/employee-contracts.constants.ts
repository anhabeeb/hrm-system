export const CONTRACT_TYPES = [
  "permanent",
  "fixed_term",
  "probation",
  "temporary",
  "part_time",
  "casual",
  "foreign_worker_contract",
  "other",
] as const;

export const CONTRACT_STATUSES = [
  "draft",
  "active",
  "expiring_soon",
  "expired",
  "renewed",
  "archived",
  "cancelled",
] as const;

export const CONTRACT_TYPES_REQUIRING_END_DATE = [
  "fixed_term",
  "probation",
  "temporary",
  "casual",
  "foreign_worker_contract",
] as const;

export const DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS = 60;

export const CONTRACT_DOCUMENT_TYPES = [
  "employment_contract",
  "contract_renewal",
  "contract_amendment",
] as const;
