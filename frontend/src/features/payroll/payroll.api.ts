import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { PayrollAdjustment, PayrollAdjustmentPayload, PayrollCalculatePayload, PayrollException, PayrollFilters, PayrollItem, PayrollRun, PayrollSubFeatureVisibility } from "./payroll.types";

export const payrollApi = {
  subFeatures: () => api.get<{ subfeatures: PayrollSubFeatureVisibility }>("/payroll/subfeatures"),
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
  finalize: (id: string, reason: string) => api.post<{ finalized: boolean; already_finalized?: boolean }>(`/payroll/${id}/finalize`, { reason }),
  lock: (id: string, reason: string) => api.post<{ locked: boolean }>(`/payroll/${id}/lock`, { reason }),
  requestReopen: (id: string, reason: string) => api.post<{ requested: boolean }>(`/payroll/${id}/request-reopen`, { reason }),
  reopen: (id: string, reason: string) => api.post<{ reopened: boolean }>(`/payroll/${id}/reopen`, { reason }),
  listAdjustments: (filters: PayrollFilters = {}) => api.get<PayrollAdjustment[]>(`/payroll/adjustments${buildQueryString(filters)}`),
  createAdjustment: (payload: PayrollAdjustmentPayload) => api.post<{ payroll_adjustment: PayrollAdjustment }>("/payroll/adjustments", payload),
  getAdjustment: (id: string) => api.get<{ payroll_adjustment: PayrollAdjustment }>(`/payroll/adjustments/${id}`),
  submitAdjustment: (id: string) => api.post<{ payroll_adjustment: PayrollAdjustment; already_submitted?: boolean }>(`/payroll/adjustments/${id}/submit`, {}),
  approveAdjustment: (id: string, reason: string) => api.post<{ payroll_adjustment: PayrollAdjustment }>(`/payroll/adjustments/${id}/approve`, { reason }),
  rejectAdjustment: (id: string, reason: string) => api.post<{ payroll_adjustment: PayrollAdjustment }>(`/payroll/adjustments/${id}/reject`, { reason }),
  cancelAdjustment: (id: string, reason: string) => api.post<{ payroll_adjustment: PayrollAdjustment }>(`/payroll/adjustments/${id}/cancel`, { reason }),
  applyAdjustment: (id: string, reason: string) => api.post<{ payroll_adjustment: PayrollAdjustment; applied?: boolean; manual_review_required?: boolean }>(`/payroll/adjustments/${id}/apply`, { reason }),
  adjustmentTimeline: (id: string) => api.get<{ payroll_adjustment: PayrollAdjustment; request: unknown | null; steps: Array<Record<string, unknown>>; actions: Array<Record<string, unknown>> }>(`/payroll/adjustments/${id}/approval-timeline`),
};
