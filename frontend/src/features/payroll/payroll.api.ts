import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { PayrollCalculatePayload, PayrollException, PayrollFilters, PayrollItem, PayrollRun } from "./payroll.types";

export const payrollApi = {
  list: (filters: PayrollFilters = {}) => api.get<PayrollRun[]>(`/payroll${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ payroll_run: PayrollRun }>(`/payroll/${id}`),
  calculate: (payload: PayrollCalculatePayload) => api.post<{ payroll_run?: PayrollRun }>("/payroll/calculate", payload),
  recalculate: (id: string, reason: string) => api.post<{ payroll_run?: PayrollRun }>(`/payroll/${id}/recalculate`, { reason }),
  listItems: (id: string, filters: PayrollFilters = {}) => api.get<PayrollItem[]>(`/payroll/${id}/items${buildQueryString(filters)}`),
  getItem: (id: string, itemId: string) => api.get<{ payroll_item: PayrollItem }>(`/payroll/${id}/items/${itemId}`),
  listExceptions: (id: string, filters: PayrollFilters = {}) => api.get<PayrollException[]>(`/payroll/${id}/exceptions${buildQueryString(filters)}`),
  resolveException: (id: string, exceptionId: string, reason: string) => api.post<{ resolved: boolean }>(`/payroll/${id}/exceptions/${exceptionId}/resolve`, { reason, resolution_notes: reason }),
  submitApproval: (id: string, reason: string) => api.post<{ submitted: boolean }>(`/payroll/${id}/submit-approval`, { reason }),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/payroll/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/payroll/${id}/reject`, { reason }),
  lock: (id: string, reason: string) => api.post<{ locked: boolean }>(`/payroll/${id}/lock`, { reason }),
  requestReopen: (id: string, reason: string) => api.post<{ requested: boolean }>(`/payroll/${id}/request-reopen`, { reason }),
  reopen: (id: string, reason: string) => api.post<{ reopened: boolean }>(`/payroll/${id}/reopen`, { reason }),
};
