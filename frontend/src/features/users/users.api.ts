import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { AdminUser, UserFilters, UserPayload } from "./users.types";

export const usersApi = {
  list: (filters: UserFilters = {}) => api.get<AdminUser[]>(`/users${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ user: AdminUser }>(`/users/${id}`),
  create: (payload: UserPayload) => api.post<{ user: AdminUser }>("/users", payload),
  update: (id: string, payload: Partial<UserPayload>) => api.patch<{ user: AdminUser }>(`/users/${id}`, payload),
  enable: (id: string, reason: string) => api.post<{ user: AdminUser }>(`/users/${id}/enable`, { reason }),
  disable: (id: string, reason: string) => api.post<{ user: AdminUser }>(`/users/${id}/disable`, { reason }),
  resetPassword: (id: string, reason: string) => api.post<Record<string, never>>(`/users/${id}/reset-password`, { reason }),
  assignRoles: (id: string, role_ids: string[], reason: string) => api.post<{ user: AdminUser }>(`/users/${id}/roles`, { role_ids, reason }),
};
