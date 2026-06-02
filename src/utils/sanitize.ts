const SENSITIVE_KEY_PARTS = [
  "password",
  "password_hash",
  "reset_token",
  "session_token",
  "refresh_token",
  "token",
  "secret",
  "salt",
  "totp",
  "backup_code",
  "api_token",
  "device_token",
  "device_token_hash",
  "api_token_hash",
  "bootstrap_admin_token",
  "session_secret",
  "password_pepper",
  "totp_encryption_key",
  "cloudflare_token",
  "file_key",
  "storage_location",
  "r2_key",
  "bank_account",
  "passport_number",
  "id_card_number",
] as const;

export interface SanitizeSensitivePayloadOptions {
  mask?: string;
}

export const sanitizeSensitivePayload = (
  value: unknown,
  options: SanitizeSensitivePayloadOptions = {},
): unknown => {
  const mask = options.mask ?? "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeSensitivePayload(item, options));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      const normalized = key.toLowerCase();
      if (SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))) {
        return [key, mask];
      }
      return [key, sanitizeSensitivePayload(nested, options)];
    }),
  );
};
