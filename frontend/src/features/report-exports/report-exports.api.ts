import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { ReportExportCatalogItem, ReportExportFormat, ReportExportJob, ReportPrintData } from "./report-exports.types";

export const reportExportsApi = {
  catalog: () => api.get<{ data: ReportExportCatalogItem[]; generated_at: string }>("/report-exports/catalog"),
  history: (filters: Record<string, unknown> = {}) =>
    api.get<{ data: ReportExportJob[]; pagination: { page: number; page_size: number; total: number; total_pages: number }; generated_at: string }>(`/report-exports/jobs${buildQueryString(filters)}`),
  preview: (reportKey: string, filters: Record<string, unknown>, format: ReportExportFormat = "xlsx") =>
    api.post<{ report_key: string; row_count: number; columns: unknown[]; redaction: unknown; sample_rows: unknown[]; warnings: string[] }>("/report-exports/preview", { report_key: reportKey, filters, format }),
  createJob: (reportKey: string, filters: Record<string, unknown>, format: ReportExportFormat = "xlsx") =>
    api.post<{ export_job: ReportExportJob; duplicate: boolean }>("/report-exports/jobs", { report_key: reportKey, filters, format }),
  generate: (id: string) => api.post<{ export_job: ReportExportJob }>(`/report-exports/jobs/${id}/generate`),
  download: (id: string) => api.download(`/report-exports/jobs/${id}/download`),
  printData: (reportKey: string, filters: Record<string, unknown>) =>
    api.get<ReportPrintData>(`/report-exports/print/${encodeURIComponent(reportKey)}${buildQueryString(filters)}`),
  employeePrintData: (employeeId: string) =>
    api.get<ReportPrintData>(`/report-exports/employee/${employeeId}/print`),
};

