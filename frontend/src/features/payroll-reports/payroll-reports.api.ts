import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { PayrollReportCatalogResponse, PayrollReportFilters, PayrollReportResult } from "./payroll-reports.types";

export const payrollReportsApi = {
  catalog: () => api.get<PayrollReportCatalogResponse>("/payroll-reports/catalog"),
  summary: (filters: PayrollReportFilters = {}) =>
    api.get<{ data: Record<string, unknown>; meta: Record<string, unknown>; generated_at: string }>(`/payroll-reports/summary${buildQueryString(filters)}`),
  report: (reportKey: string, filters: PayrollReportFilters = {}) =>
    api.get<PayrollReportResult>(`/payroll-reports/${reportKey}${buildQueryString(filters)}`),
};
