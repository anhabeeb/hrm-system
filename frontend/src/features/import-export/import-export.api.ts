import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { sanitizeImportExportRows, sanitizeImportExportValue } from "./import-export-sanitize";
import type { ExportCreatePayload, ExportJob, ImportExportFilters, ImportJob, ImportTemplate, ImportUploadPayload } from "./import-export.types";

export const importExportApi = {
  listExports: async (filters: ImportExportFilters = {}) => {
    const response = await api.get<ExportJob[]>(`/import-export/exports${buildQueryString(filters)}`);
    return { ...response, data: sanitizeImportExportRows(response.data) };
  },
  getExport: async (id: string) => {
    const response = await api.get<ExportJob>(`/import-export/exports/${id}`);
    return { ...response, data: sanitizeImportExportValue(response.data) };
  },
  createExport: (payload: ExportCreatePayload) => api.post<{ export_job: ExportJob }>("/import-export/exports", payload),
  downloadExport: (id: string) => api.download(`/import-export/exports/${id}/download`),
  cancelExport: (id: string, reason: string) => api.post<ExportJob>(`/import-export/exports/${id}/cancel`, { reason }),
  retryExport: (id: string, reason: string) => api.post<ExportJob>(`/import-export/exports/${id}/retry`, { reason }),
  listImports: async (filters: ImportExportFilters = {}) => {
    const response = await api.get<ImportJob[]>(`/import-export/imports${buildQueryString(filters)}`);
    return { ...response, data: sanitizeImportExportRows(response.data) };
  },
  getImport: async (id: string) => {
    const response = await api.get<ImportJob>(`/import-export/imports/${id}`);
    return { ...response, data: sanitizeImportExportValue(response.data) };
  },
  uploadImport: (payload: ImportUploadPayload) => api.post<{ import_job: ImportJob }>("/import-export/imports/upload", payload),
  validateImport: (id: string) => api.post<Record<string, unknown>>(`/import-export/imports/${id}/validate`),
  applyImport: (id: string, reason: string) => api.post<{ applied?: boolean; import_job_id?: string; applied_rows?: number; failed_rows?: number; errors?: Array<{ row: number; message: string }> }>(`/import-export/imports/${id}/apply`, { reason }),
  cancelImport: (id: string, reason: string) => api.post<{ import_job_id: string; status: string }>(`/import-export/imports/${id}/cancel`, { reason }),
  templates: async () => {
    const response = await api.get<ImportTemplate[]>("/import-export/templates");
    return { ...response, data: sanitizeImportExportRows(response.data) };
  },
  templateDetail: async (templateKey: string) => {
    const response = await api.get<ImportTemplate>(`/import-export/templates/${templateKey}`);
    return { ...response, data: sanitizeImportExportValue(response.data) };
  },
};
