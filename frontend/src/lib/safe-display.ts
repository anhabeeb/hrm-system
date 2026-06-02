import { ApiError } from "@/lib/api-errors";

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /hash/i,
  /api_key/i,
  /file_key/i,
  /r2/i,
  /fingerprint/i,
  /face_template/i,
  /image_base64/i,
  /biometric_template/i,
];

export const sanitizeForDisplay = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeForDisplay);
  if (!value || typeof value !== "object") return value;

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((next, [key, entry]) => {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      next[key] = "[redacted]";
      return next;
    }
    next[key] = sanitizeForDisplay(entry);
    return next;
  }, {});
};

export const friendlyOperationalError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();
    if (error.code === "RECORD_LOCKED" || error.code === "PAYROLL_LOCKED" || message.includes("locked payroll")) {
      return "This attendance record affects a locked payroll period.";
    }
    if (error.status === 403 || error.code.includes("PERMISSION") || error.code.includes("ACCESS_DENIED")) {
      return "You do not have permission to perform this action.";
    }
    return error.message || fallback;
  }
  return fallback;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export const formatDate = (value?: string | null) => {
  if (!value) return "Not recorded";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

export const humanize = (value?: string | null) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not recorded";
