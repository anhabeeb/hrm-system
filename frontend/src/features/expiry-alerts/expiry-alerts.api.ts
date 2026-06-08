import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { ExpiryAlert, ExpiryAlertFilters, ExpiryAlertSettings, ExpiryAlertSummary, ExpiryScanInput } from "./expiry-alerts.types";

export const expiryAlertsApi = {
  list: (filters: ExpiryAlertFilters = {}) => api.get<ExpiryAlert[]>(`/expiry-alerts${buildQueryString(filters)}`),
  summary: () => api.get<{ summary: ExpiryAlertSummary }>("/expiry-alerts/summary"),
  get: (id: string) => api.get<{ alert: ExpiryAlert }>(`/expiry-alerts/${id}`),
  settings: () => api.get<{ settings: ExpiryAlertSettings }>("/expiry-alerts/settings"),
  updateSettings: (settings: Partial<ExpiryAlertSettings> & { reason: string }) =>
    api.patch<{ settings: ExpiryAlertSettings }>("/expiry-alerts/settings", settings),
  previewScan: (input: ExpiryScanInput) =>
    api.post<{ candidates: ExpiryAlert[]; count: number; preview: boolean; generated_at: string }>("/expiry-alerts/scan/preview", input),
  runScan: (input: ExpiryScanInput) =>
    api.post<{ created: number; refreshed: number; notified: number; scanned: number; alerts: ExpiryAlert[]; generated_at: string }>("/expiry-alerts/scan/run", input),
  acknowledge: (id: string, reason?: string) => api.post<{ alert: ExpiryAlert }>(`/expiry-alerts/${id}/acknowledge`, { reason }),
  resolve: (id: string, reason: string) => api.post<{ alert: ExpiryAlert }>(`/expiry-alerts/${id}/resolve`, { reason }),
  dismiss: (id: string, reason: string) => api.post<{ alert: ExpiryAlert }>(`/expiry-alerts/${id}/dismiss`, { reason }),
  snooze: (id: string, reason: string, snoozed_until: string) => api.post<{ alert: ExpiryAlert }>(`/expiry-alerts/${id}/snooze`, { reason, snoozed_until }),
};
