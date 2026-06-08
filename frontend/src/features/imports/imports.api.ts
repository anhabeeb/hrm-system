import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { ImportFilters, ImportJob, ImportListResponse, ImportPreviewPayload, ImportPreviewResult, ImportRow, ImportTemplate } from "./imports.types";

export const importsApi = {
  templates: () => api.get<{ data: ImportTemplate[]; generated_at: string }>("/imports/templates"),
  template: (importType: string) => api.get<{ data: ImportTemplate; generated_at: string }>(`/imports/templates/${encodeURIComponent(importType)}`),
  templateCsvUrl: (importType: string) => `/imports/templates/${encodeURIComponent(importType)}/csv`,
  downloadTemplateCsv: (importType: string) => api.download(`/imports/templates/${encodeURIComponent(importType)}/csv`),
  jobs: (filters: ImportFilters = {}) => api.get<ImportListResponse<ImportJob>>(`/imports/jobs${buildQueryString(filters)}`),
  job: (id: string) => api.get<{ job: ImportJob }>(`/imports/jobs/${id}`),
  rows: (id: string, filters: ImportFilters = {}) => api.get<ImportListResponse<ImportRow>>(`/imports/jobs/${id}/rows${buildQueryString(filters)}`),
  errors: (id: string, filters: ImportFilters = {}) => api.get<ImportListResponse<ImportRow>>(`/imports/jobs/${id}/errors${buildQueryString(filters)}`),
  preview: (payload: ImportPreviewPayload) => api.post<ImportPreviewResult>("/imports/preview", payload, { timeoutMs: 30000 }),
  createJob: (payload: ImportPreviewPayload) => api.post<{ job: ImportJob; summary: ImportPreviewResult["summary"]; sample_rows: ImportRow[]; errors: ImportPreviewResult["errors"]; duplicate?: boolean }>("/imports/jobs", payload, { timeoutMs: 30000 }),
  validateJob: (id: string) => api.post<ImportPreviewResult>(`/imports/jobs/${id}/validate`, undefined, { timeoutMs: 30000 }),
  applyJob: (id: string) => api.post<{ job: ImportJob; summary: { created_rows: number; updated_rows: number; skipped_rows: number; failed_rows: number }; already_applied?: boolean }>(`/imports/jobs/${id}/apply`, undefined, { timeoutMs: 30000 }),
  cancelJob: (id: string) => api.post<{ job: ImportJob }>(`/imports/jobs/${id}/cancel`),
};
