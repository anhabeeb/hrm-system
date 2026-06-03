const sensitiveKeys = [
  "file_key",
  "r2_key",
  "object_key",
  "storage_location",
  "private_path",
  "password",
  "token",
  "secret",
  "hash",
  "backup_codes",
];

export const redactSensitiveValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key.toLowerCase() !== "file_key")
      .map(([key, nested]) => {
        const lower = key.toLowerCase();
        if (sensitiveKeys.some((sensitive) => lower.includes(sensitive))) return [key, "[REDACTED]"];
        return [key, redactSensitiveValue(nested)];
      }),
  );
};

export const maskSensitiveFileName = (fileName: string | undefined, isSensitive: boolean | number | undefined, canViewSensitive: boolean) => {
  if (isSensitive && !canViewSensitive) return "Sensitive document";
  return fileName ?? "Document";
};
