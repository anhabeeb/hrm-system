const sensitiveKeys = [
  "file_key",
  "r2_key",
  "object_key",
  "storage_key",
  "storage_location",
  "internal_storage_path",
  "private_path",
  "signed_url",
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
      .filter(([key]) => !sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive)))
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
