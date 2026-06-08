import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { ArchiveJob, ArchiveJobItem, ArchiveListResponse, ArchivePreviewPayload, ArchivePreviewResult, RetentionSettings } from "./data-retention.types";

export const dataRetentionApi = {
  settings: () => api.get<RetentionSettings>("/data-retention/settings"),
  updateSettings: (payload: Partial<RetentionSettings> & { reason: string }) => api.patch<RetentionSettings>("/data-retention/settings", payload),
  summary: () => api.get<Record<string, unknown>>("/data-retention/summary"),
  jobs: (filters: Record<string, unknown> = {}) => api.get<ArchiveListResponse<ArchiveJob>>(`/data-retention/archive-jobs${buildQueryString(filters)}`),
  job: (id: string) => api.get<ArchiveJob>(`/data-retention/archive-jobs/${id}`),
  items: (id: string, filters: Record<string, unknown> = {}) => api.get<ArchiveListResponse<ArchiveJobItem>>(`/data-retention/archive-jobs/${id}/items${buildQueryString(filters)}`),
  preview: (payload: ArchivePreviewPayload) => api.post<ArchivePreviewResult>("/data-retention/archive-jobs/preview", payload, { timeoutMs: 30000 }),
  apply: (id: string, payload: { confirmation: string; reason: string }) => api.post<{ job: ArchiveJob; summary: Record<string, number> }>(`/data-retention/archive-jobs/${id}/apply`, payload, { timeoutMs: 30000 }),
  cancel: (id: string, payload: { reason: string }) => api.post<ArchiveJob>(`/data-retention/archive-jobs/${id}/cancel`, payload),
  restoreItem: (sourceType: string, sourceId: string, payload: { reason: string }) => api.post<{ source_type: string; source_id: string; status: string; message?: string }>(`/data-retention/items/${sourceType}/${sourceId}/restore`, payload),
};
