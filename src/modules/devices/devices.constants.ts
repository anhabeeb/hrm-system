export const DEVICE_TYPES = [
  "kiosk",
  "biometric",
  "biometric_placeholder",
  "bridge",
  "local_bridge",
  "mobile",
  "web",
  "tablet",
  "other",
] as const;

export const DEVICE_STATUSES = ["pending", "active", "suspended", "revoked", "offline", "disabled", "maintenance"] as const;
export const DEVICE_HEALTH_STATUSES = ["online", "warning", "offline"] as const;
