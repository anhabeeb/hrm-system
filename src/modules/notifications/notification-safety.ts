import { AppError } from "../../utils/errors";

const forbiddenMetadataKeys = [
  "password",
  "password_hash",
  "token",
  "secret",
  "api_token",
  "api_token_hash",
  "device_token",
  "device_token_hash",
  "file_key",
  "storage_key",
  "r2_key",
  "signed_url",
  "biometric_template",
  "biometric_image",
  "raw_payload_json",
];

export const sanitizeNotificationMetadata = (metadata?: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!metadata) return null;
  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitizeValue).filter((item) => item !== undefined);
    if (value && typeof value === "object") {
      const safe: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const normalized = key.toLowerCase();
        if (forbiddenMetadataKeys.some((forbidden) => normalized.includes(forbidden))) continue;
        const next = sanitizeValue(child);
        if (next !== undefined) safe[key] = next;
      }
      return safe;
    }
    if (typeof value === "function" || typeof value === "symbol" || value === undefined) return undefined;
    return value;
  };
  return sanitizeValue(metadata) as Record<string, unknown>;
};

export const sanitizeActionUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    throw new AppError("Notification actions must use safe internal app routes.", "NOTIFICATION_INVALID_STATUS", 400);
  }
  return trimmed;
};

export const sanitizeFailureMessage = (value: unknown) =>
  String(value instanceof Error ? value.message : value ?? "Email delivery failed.")
    .replace(/(api[_-]?key|authorization|bearer|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
