import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Permission, Role } from "./roles.types";

export const rolesApi = {
  list: (filters: { search?: string; status?: string; page?: number; page_size?: number } = {}) =>
    api.get<Role[]>(`/roles${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ role: Role }>(`/roles/${id}`),
  permissions: () => api.get<Permission[]>("/permissions"),
};
