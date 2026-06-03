import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Department, DepartmentFilters, DepartmentPayload } from "./departments.types";

export const departmentsApi = {
  list: (filters: DepartmentFilters = {}) => api.get<Department[]>(`/departments${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ department: Department }>(`/departments/${id}`),
  create: (payload: DepartmentPayload) => api.post<{ department: Department } | { id: string }>("/departments", payload),
  update: (id: string, payload: Partial<DepartmentPayload>) => api.patch<{ department: Department } | { updated: boolean }>(`/departments/${id}`, payload),
  delete: (id: string, reason: string) => api.delete<{ deleted: boolean }>(`/departments/${id}`, { reason }),
};
