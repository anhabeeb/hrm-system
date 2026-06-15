import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { AdvanceFilters, AdvancePayment, AdvancePayload, AdvanceSalaryPayload, AdvanceSalaryRequest } from "./advances.types";

export const advancesApi = {
  list: (filters: AdvanceFilters = {}) => api.get<AdvancePayment[]>(`/advances${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ advance: AdvancePayment }>(`/advances/${id}`),
  create: (payload: AdvancePayload) => api.post<{ advance?: AdvancePayment }>("/advances", payload),
  update: (id: string, payload: Partial<AdvancePayload>) => api.patch<{ advance?: AdvancePayment }>(`/advances/${id}`, payload),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/advances/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/advances/${id}/reject`, { reason }),
  listSalaryRequests: (filters: AdvanceFilters = {}) => api.get<AdvanceSalaryRequest[]>(`/advances/salary-requests${buildQueryString(filters)}`),
  createSalaryRequest: (payload: AdvanceSalaryPayload) => api.post<{ advance_salary_request: AdvanceSalaryRequest }>("/advances/salary-requests", payload),
  getSalaryRequest: (id: string) => api.get<{ advance_salary_request: AdvanceSalaryRequest }>(`/advances/salary-requests/${id}`),
  submitSalaryRequest: (id: string) => api.post<{ advance_salary_request: AdvanceSalaryRequest; already_submitted?: boolean }>(`/advances/salary-requests/${id}/submit`, {}),
  approveSalaryRequest: (id: string, reason: string) => api.post<{ advance_salary_request: AdvanceSalaryRequest }>(`/advances/salary-requests/${id}/approve`, { reason }),
  rejectSalaryRequest: (id: string, reason: string) => api.post<{ advance_salary_request: AdvanceSalaryRequest }>(`/advances/salary-requests/${id}/reject`, { reason }),
  cancelSalaryRequest: (id: string, reason: string) => api.post<{ advance_salary_request: AdvanceSalaryRequest }>(`/advances/salary-requests/${id}/cancel`, { reason }),
  executeSalaryPayment: (id: string, reason: string, payment_date?: string) =>
    api.post<{ advance_salary_request: AdvanceSalaryRequest; paid?: boolean; already_paid?: boolean; manual_review_required?: boolean }>(
      `/advances/salary-requests/${id}/execute-payment`,
      { reason, payment_date },
    ),
  salaryRequestDeductions: (id: string) =>
    api.get<{ advance_salary_request: AdvanceSalaryRequest; deductions: Array<Record<string, unknown>> }>(`/advances/salary-requests/${id}/deductions`),
  salaryRequestTimeline: (id: string) =>
    api.get<{ advance_salary_request: AdvanceSalaryRequest; request: unknown | null; steps: Array<Record<string, unknown>>; actions: Array<Record<string, unknown>>; deductions?: Array<Record<string, unknown>> }>(
      `/advances/salary-requests/${id}/approval-timeline`,
    ),
};
