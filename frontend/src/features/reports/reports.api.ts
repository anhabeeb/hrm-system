import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { sanitizeReportValue } from "./report-sanitize";
import type { ReportDefinition, ReportFilters, ReportGeneratePayload, ReportResult } from "./reports.types";

const safe = <T,>(response: T) => sanitizeReportValue(response);

export const reportsApi = {
  list: async () => {
    const response = await api.get<{ reports: ReportDefinition[] }>("/reports");
    return { ...response, data: safe(response.data) };
  },
  catalog: async () => {
    const response = await api.get<{ reports: ReportDefinition[] }>("/reports/catalog");
    return { ...response, data: safe(response.data) };
  },
  generate: async (payload: ReportGeneratePayload) => {
    const response = await api.post<ReportResult>("/reports/generate", payload);
    return { ...response, data: safe(response.data) };
  },
  dashboardSummary: async () => {
    const response = await api.get<Record<string, unknown>>("/reports/dashboard/summary");
    return { ...response, data: safe(response.data) };
  },
  byPath: async (path: string, filters: ReportFilters = {}) => {
    const response = await api.get<ReportResult>(`${path}${buildQueryString(filters)}`);
    return { ...response, data: safe(response.data) };
  },
};
