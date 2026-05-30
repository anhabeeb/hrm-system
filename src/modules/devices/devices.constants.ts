export const DEVICE_TYPES = [
  "kiosk",
  "biometric_placeholder",
  "local_bridge",
  "tablet",
  "other",
] as const;

export const DEVICE_STATUSES = ["active", "disabled", "maintenance"] as const;
export const DEVICE_HEALTH_STATUSES = ["online", "warning", "offline"] as const;
