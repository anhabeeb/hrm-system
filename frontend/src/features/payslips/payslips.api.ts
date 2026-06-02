import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Payslip, PayslipFilters } from "./payslips.types";

export const payslipsApi = {
  list: (filters: PayslipFilters = {}) => api.get<Payslip[]>(`/payslips${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ payslip: Payslip }>(`/payslips/${id}`),
  generateBatch: (payload: { payroll_run_id: string; outlet_id?: string; reason: string }) => api.post<{ created?: number; skipped_existing?: number }>("/payslips/generate-batch", payload),
  downloadPlaceholder: (id: string) => api.get<Record<string, unknown>>(`/payslips/${id}/download-placeholder`),
};
