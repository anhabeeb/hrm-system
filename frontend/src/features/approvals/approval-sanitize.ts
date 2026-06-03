const sensitiveKeys = ["file_key", "r2_key", "object_key", "storage_location", "password", "token", "secret", "hash", "totp", "backup_code"];

export const sanitizeApprovalPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeApprovalPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      const lower = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lower.includes(sensitive))) return [key, "[REDACTED]"];
      return [key, sanitizeApprovalPayload(nested)];
    }),
  );
};
