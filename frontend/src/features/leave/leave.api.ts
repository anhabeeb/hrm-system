import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { LeaveBalance, LeaveBalanceAdjustPayload, LeaveFilters, LeavePolicy, LeaveRequest, LeaveRequestPayload, LeaveType } from "./leave.types";

export const leaveApi = {
  listRequests: (filters: LeaveFilters = {}) => api.get<LeaveRequest[]>(`/leave/requests${buildQueryString(filters)}`),
  getRequest: (id: string) => api.get<{ leave_request: LeaveRequest }>(`/leave/requests/${id}`),
  createRequest: (payload: LeaveRequestPayload) => api.post<{ leave_request?: LeaveRequest; long_leave_required?: boolean }>("/leave/requests", payload),
  updateRequest: (id: string, payload: Partial<LeaveRequestPayload>) => api.patch<{ leave_request?: LeaveRequest }>(`/leave/requests/${id}`, payload),
  approveRequest: (id: string, reason: string) => api.post<{ approved: boolean }>(`/leave/requests/${id}/approve`, { reason }),
  rejectRequest: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/leave/requests/${id}/reject`, { reason }),
  cancelRequest: (id: string, reason: string) => api.post<{ cancelled: boolean }>(`/leave/requests/${id}/cancel`, { reason }),
  listBalances: (filters: LeaveFilters = {}) => api.get<LeaveBalance[]>(`/leave/balances${buildQueryString(filters)}`),
  adjustBalance: (employeeId: string, payload: LeaveBalanceAdjustPayload) => api.post<{ updated: boolean }>(`/leave/balances/${employeeId}/adjust`, payload),
  listTypes: (filters: LeaveFilters = {}) => api.get<LeaveType[]>(`/leave/types${buildQueryString(filters)}`),
  listPolicies: (filters: LeaveFilters = {}) => api.get<LeavePolicy[]>(`/leave/policies${buildQueryString(filters)}`),
  calendar: (filters: LeaveFilters = {}) => api.get<{ calendar: LeaveRequest[] }>(`/leave/calendar${buildQueryString(filters)}`),
};
