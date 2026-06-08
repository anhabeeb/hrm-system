export const BIOMETRIC_EVENT_TYPES = [
  "clock_in",
  "clock_out",
  "check_in",
  "check_out",
  "break_start",
  "break_end",
  "unknown",
] as const;

export const BIOMETRIC_VERIFICATION_METHODS = [
  "fingerprint",
  "face",
  "card",
  "pin",
  "unknown",
] as const;

export const BIOMETRIC_DEVICE_TYPES = [
  "biometric",
  "kiosk",
  "bridge",
  "mobile",
  "web",
  "fingerprint",
  "face",
  "multi_modal",
  "card",
  "pin",
  "other",
] as const;

export const BIOMETRIC_SYNC_MODES = ["push_api", "local_bridge", "manual_import_placeholder"] as const;
export const BIOMETRIC_STATUSES = [
  "pending",
  "active",
  "suspended",
  "revoked",
  "offline",
  "disabled",
  "maintenance",
] as const;
export const BIOMETRIC_LOG_STATUSES = [
  "accepted",
  "duplicate",
  "unmatched_employee",
  "ambiguous_employee",
  "invalid_timestamp",
  "rejected",
  "manually_resolved",
  "pending",
  "unmatched",
  "conflict",
  "deduped",
] as const;

export const BIOMETRIC_FORBIDDEN_PAYLOAD_KEYS = [
  "fingerprint_template",
  "face_template",
  "fingerprint_image",
  "face_image",
  "image_base64",
  "template",
  "biometric_template",
] as const;

export const BIOMETRIC_TIME_WARNING_MINUTES = 5;
export const BIOMETRIC_TIME_CONFLICT_MINUTES = 30;
export const BIOMETRIC_FUTURE_TOLERANCE_MINUTES = 10;
export const BIOMETRIC_OFFLINE_THRESHOLD_HOURS = 24;
export const DEFAULT_BIOMETRIC_BATCH_SIZE = 100;
