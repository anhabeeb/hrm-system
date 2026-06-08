import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { HrReportCatalogResponse, HrReportFilters, HrReportResult } from "./hr-reports.types";

export const hrReportsApi = {
  catalog: () => api.get<HrReportCatalogResponse>("/hr-reports/catalog"),
  summary: (filters: HrReportFilters = {}) =>
    api.get<{ data: Record<string, unknown>; meta: Record<string, unknown>; generated_at: string }>(`/hr-reports/summary${buildQueryString(filters)}`),
  report: (reportKey: string, filters: HrReportFilters = {}) =>
    api.get<HrReportResult>(`/hr-reports/${reportKey}${buildQueryString(filters)}`),
};
