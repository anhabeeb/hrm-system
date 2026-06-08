import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { LongLeaveFilters, LongLeavePayload, LongLeaveRecord, LongLeaveSettings, LongLeaveSettingsPayload, SalaryImpactRow } from "./long-leave.types";

export const longLeaveApi = {
  list: (filters: LongLeaveFilters = {}) => api.get<LongLeaveRecord[]>(`/long-leave${buildQueryString(filters)}`),
  get: (id: string) => api.get<LongLeaveRecord | { long_leave: LongLeaveRecord }>(`/long-leave/${id}`),
  create: (payload: LongLeavePayload) => api.post<{ long_leave?: LongLeaveRecord; salary_impact_calculated?: boolean }>("/long-leave", payload),
  salaryImpact: (id: string) => api.get<{ months: SalaryImpactRow[] }>(`/long-leave/${id}/salary-impact`),
  timeline: (id: string) => api.get<Record<string, unknown>>(`/long-leave/${id}/timeline`),
  calculateSalaryImpact: (id: string) => api.post<{ months?: SalaryImpactRow[] }>(`/long-leave/${id}/calculate-salary-impact`, {}),
  payrollPreview: (id: string) => api.post<{ months: SalaryImpactRow[]; totals?: Record<string, number>; warnings?: Array<{ payroll_month?: string; message?: string }> }>(`/long-leave/${id}/payroll-preview`, {}),
  payrollApply: (id: string, reason: string) => api.post<{ applied: boolean; months?: SalaryImpactRow[] }>(`/long-leave/${id}/payroll-apply`, { reason }),
  confirmSalaryImpact: (id: string, reason: string) => api.post<{ confirmed: boolean }>(`/long-leave/${id}/confirm-salary-impact`, { reason }),
  submit: (id: string, reason: string) => api.post<{ submitted: boolean }>(`/long-leave/${id}/submit`, { reason }),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/long-leave/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/long-leave/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) => api.post<{ cancelled: boolean }>(`/long-leave/${id}/cancel`, { reason }),
  extend: (id: string, new_expected_return_date: string, reason: string) => api.post<{ extended: boolean }>(`/long-leave/${id}/extend`, { new_expected_return_date, reason }),
  returnFromLeave: (id: string, actual_return_date: string, reason: string) => api.post<{ returned: boolean }>(`/long-leave/${id}/return`, { actual_return_date, reason }),
  settings: () => api.get<{ settings: LongLeaveSettings }>("/long-leave/settings"),
  updateSettings: (payload: LongLeaveSettingsPayload) => api.patch<{ settings: LongLeaveSettings }>("/long-leave/settings", payload),
};
