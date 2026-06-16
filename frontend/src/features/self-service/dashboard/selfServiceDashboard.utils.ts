import type { SelfDashboardModernWidgets } from "../self-service.types";

export const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const asArray = <T = Record<string, unknown>>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const visible = (widget: SelfDashboardModernWidgets[keyof SelfDashboardModernWidgets] | undefined) =>
  Boolean(widget?.visible);

export const statusTone = (value: unknown) => {
  const status = String(value ?? "").toLowerCase();
  if (/reject|fail|absent|expired|blocked|missing/.test(status)) return "danger" as const;
  if (/pending|review|late|warning|attention/.test(status)) return "warning" as const;
  if (/approved|present|paid|verified|ok|complete/.test(status)) return "success" as const;
  return "neutral" as const;
};
