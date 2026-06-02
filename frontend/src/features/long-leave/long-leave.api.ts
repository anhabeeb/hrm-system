import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { LongLeaveFilters, LongLeavePayload, LongLeaveRecord, SalaryImpactRow } from "./long-leave.types";

export const longLeaveApi = {
  list: (filters: LongLeaveFilters = {}) => api.get<LongLeaveRecord[]>(`/long-leave${buildQueryString(filters)}`),
  get: (id: string) => api.get<LongLeaveRecord | { long_leave: LongLeaveRecord }>(`/long-leave/${id}`),
  create: (payload: LongLeavePayload) => api.post<{ long_leave?: LongLeaveRecord; salary_impact_calculated?: boolean }>("/long-leave", payload),
  salaryImpact: (id: string) => api.get<{ months: SalaryImpactRow[] }>(`/long-leave/${id}/salary-impact`),
  calculateSalaryImpact: (id: string) => api.post<{ months?: SalaryImpactRow[] }>(`/long-leave/${id}/calculate-salary-impact`, {}),
  confirmSalaryImpact: (id: string, reason: string) => api.post<{ confirmed: boolean }>(`/long-leave/${id}/confirm-salary-impact`, { reason }),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/long-leave/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/long-leave/${id}/reject`, { reason }),
  returnFromLeave: (id: string, actual_return_date: string, reason: string) => api.post<{ returned: boolean }>(`/long-leave/${id}/return`, { actual_return_date, reason }),
};
