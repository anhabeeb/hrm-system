import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { EmployeeExitPayload, EmployeeExitRequest, EmployeeExitTask, EmployeeExitTimeline } from "./employeeExit.types";

export const employeeExitApi = {
  list: (filters: Record<string, unknown> = {}) =>
    api.get<EmployeeExitRequest[]>(`/employees/exit-requests${buildQueryString(filters)}`),
  create: (payload: EmployeeExitPayload) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>("/employees/exit-requests", payload),
  submit: (id: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest; already_submitted?: boolean }>(`/employees/exit-requests/${id}/submit`),
  get: (id: string) =>
    api.get<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}`),
  approve: (id: string, reason: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}/approve`, { reason }),
  reject: (id: string, reason: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}/cancel`, { reason }),
  apply: (id: string, reason: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}/apply`, { reason }),
  complete: (id: string, reason: string) =>
    api.post<{ employee_exit_request: EmployeeExitRequest }>(`/employees/exit-requests/${id}/complete`, { reason }),
  timeline: (id: string) =>
    api.get<EmployeeExitTimeline>(`/employees/exit-requests/${id}/timeline`),
  tasks: (id: string) =>
    api.get<{ employee_exit_request: EmployeeExitRequest; tasks: EmployeeExitTask[] }>(`/employees/exit-requests/${id}/tasks`),
  completeTask: (id: string, taskId: string, reason: string) =>
    api.post<{ tasks: EmployeeExitTask[] }>(`/employees/exit-requests/${id}/tasks/${taskId}/complete`, { reason }),
  waiveTask: (id: string, taskId: string, reason: string) =>
    api.post<{ tasks: EmployeeExitTask[] }>(`/employees/exit-requests/${id}/tasks/${taskId}/waive`, { reason }),
  audit: (id: string) =>
    api.get<EmployeeExitTimeline>(`/employees/exit-requests/${id}/audit`),
};
