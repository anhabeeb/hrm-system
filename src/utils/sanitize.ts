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
  "national_id",
  "work_permit",
  "raw_payload",
] as const;

const SENSITIVE_TEXT_PATTERNS: RegExp[] = [
  /authorization\s+bearer\s+[^\s,;}"']+/gi,
  /bearer\s+[^\s,;}"']+/gi,
  /\b(password|password_hash|reset_token|session_token|refresh_token|token|secret|salt|totp|backup_code|api[_-]?token|device[_-]?token|bootstrap[_-]?admin[_-]?token|session[_-]?secret|password[_-]?pepper|cloudflare[_-]?token|file[_-]?key|storage[_-]?key|storage[_-]?location|r2[_-]?key|private[_-]?key|bank[_-]?account|passport[_-]?number|id[_-]?card[_-]?number|national[_-]?id|work[_-]?permit)\s*[:=]\s*([^\s,;}"']+)/gi,
  /\b(passport|national id|national_id|work permit|work_permit)\s+([A-Z0-9-]{5,})/gi,
  /([A-Za-z0-9+/]{80,}={0,2})/g,
];

export interface SanitizeSensitivePayloadOptions {
  mask?: string;
}

export const sanitizeSensitiveText = (
  value: string,
  options: SanitizeSensitivePayloadOptions = {},
): string => {
  const mask = options.mask ?? "[REDACTED]";
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (text, pattern) =>
      text.replace(pattern, (match, key) => {
        if (typeof key === "string" && /authorization|bearer/i.test(match)) {
          return match.toLowerCase().startsWith("authorization") ? "Authorization=[REDACTED]" : "Bearer [REDACTED]";
        }
        if (typeof key === "string" && /passport|national|work permit|work_permit/i.test(match) && !/[=:]/.test(match)) {
          return `${key} ${mask}`;
        }
        if (typeof key === "string" && match.includes("=")) return `${key}=${mask}`;
        if (typeof key === "string" && match.includes(":")) return `${key}: ${mask}`;
        return mask;
      }),
    value,
  );
};

export const sanitizeSensitivePayload = (
  value: unknown,
  options: SanitizeSensitivePayloadOptions = {},
): unknown => {
  const mask = options.mask ?? "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeSensitivePayload(item, options));
  if (typeof value === "string") return sanitizeSensitiveText(value, options);
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
