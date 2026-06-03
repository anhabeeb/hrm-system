export const BIOMETRIC_EVENT_TYPES = ["clock_in", "clock_out"] as const;

export const BIOMETRIC_VERIFICATION_METHODS = [
  "fingerprint",
  "face",
  "card",
  "pin",
  "unknown",
] as const;

export const BIOMETRIC_DEVICE_TYPES = [
  "fingerprint",
  "face",
  "multi_modal",
  "card",
  "pin",
  "other",
] as const;

export const BIOMETRIC_SYNC_MODES = ["push_api", "local_bridge", "manual_import_placeholder"] as const;
export const BIOMETRIC_STATUSES = ["active", "disabled", "maintenance"] as const;
export const BIOMETRIC_LOG_STATUSES = ["accepted", "pending", "unmatched", "conflict", "deduped"] as const;

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
export const DEFAULT_BIOMETRIC_BATCH_SIZE = 100;
