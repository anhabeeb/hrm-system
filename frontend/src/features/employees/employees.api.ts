import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Employee, EmployeeDetailResponse, EmployeeDocumentRow, EmployeeFilters, EmployeeNoteRow, EmployeePayload, EmployeeSalaryRow, EmployeeUpdatePayload } from "./employees.types";

export const employeesApi = {
  list: (filters: EmployeeFilters) => api.get<Employee[]>(`/employees${buildQueryString(filters)}`),
  get: (id: string) => api.get<EmployeeDetailResponse>(`/employees/${id}`),
  create: (payload: EmployeePayload) => api.post<{ employee: Employee } | { id: string }>("/employees", payload),
  update: (id: string, payload: EmployeeUpdatePayload) => api.patch<{ employee: Employee } | { updated: boolean }>(`/employees/${id}`, payload),
  salaryHistory: (id: string) => api.get<{ history: EmployeeSalaryRow[] }>(`/employees/${id}/salary-history`),
  documents: (id: string) => api.get<{ documents: EmployeeDocumentRow[] }>(`/employees/${id}/documents`),
  notes: (id: string) => api.get<{ notes: EmployeeNoteRow[] }>(`/employees/${id}/notes`),
};
