import { formatDate, formatDateTime, humanize } from "@/lib/safe-display";

export const formatReportValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (typeof value === "string") return humanize(value);
  return JSON.stringify(value);
};

export const reportColumnLabel = (key: string) => humanize(key);
