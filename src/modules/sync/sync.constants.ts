export const SYNC_ENTITY_TYPES = ["attendance"] as const;

export const SYNC_ACTION_TYPES = [
  "clock_in",
  "clock_out",
  "manual_entry_placeholder",
] as const;

export const SYNC_CONFLICT_TYPES = [
  "duplicate_punch",
  "wrong_outlet",
  "inactive_employee",
  "manual_vs_device",
  "device_time_warning",
  "payroll_locked",
  "missing_employee",
  "unsupported_item",
  "invalid_payload",
] as const;

export const SYNC_RESOLUTIONS = ["accept", "reject", "merge", "ignore"] as const;

export const SYNC_BATCH_STATUSES = [
  "received",
  "completed",
  "partial_conflict",
  "failed",
] as const;

export const DEFAULT_MAX_RECORDS_PER_BATCH = 100;
export const DEVICE_TIME_WARNING_MINUTES = 5;
export const DEVICE_TIME_CONFLICT_MINUTES = 30;
