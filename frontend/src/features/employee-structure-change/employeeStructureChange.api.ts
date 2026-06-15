import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { EmployeeStructureChangeItem, EmployeeStructureChangePayload, EmployeeStructureChangeRequest, EmployeeStructureChangeTimeline } from "./employeeStructureChange.types";

export const employeeStructureChangeApi = {
  list: (filters: Record<string, unknown> = {}) =>
    api.get<EmployeeStructureChangeRequest[]>(`/employees/structure-change-requests${buildQueryString(filters)}`),
  create: (payload: EmployeeStructureChangePayload) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest }>("/employees/structure-change-requests", payload),
  submit: (id: string) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest; already_submitted?: boolean }>(`/employees/structure-change-requests/${id}/submit`),
  get: (id: string) =>
    api.get<{ employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}`),
  approve: (id: string, reason: string) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/approve`, { reason }),
  reject: (id: string, reason: string) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/cancel`, { reason }),
  apply: (id: string, reason: string) =>
    api.post<{ employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/apply`, { reason }),
  timeline: (id: string) =>
    api.get<EmployeeStructureChangeTimeline & { employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/timeline`),
  items: (id: string) =>
    api.get<{ employee_structure_change_request: EmployeeStructureChangeRequest; items: EmployeeStructureChangeItem[] }>(`/employees/structure-change-requests/${id}/items`),
  audit: (id: string) =>
    api.get<EmployeeStructureChangeTimeline & { employee_structure_change_request: EmployeeStructureChangeRequest }>(`/employees/structure-change-requests/${id}/audit`),
};
