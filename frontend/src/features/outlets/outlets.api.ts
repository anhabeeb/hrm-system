import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Outlet, OutletFilters, OutletPayload } from "./outlets.types";

export const outletsApi = {
  list: (filters: OutletFilters = {}) => api.get<Outlet[]>(`/outlets${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ outlet: Outlet }>(`/outlets/${id}`),
  create: (payload: OutletPayload) => api.post<{ outlet: Outlet } | { id: string }>("/outlets", payload),
  update: (id: string, payload: Partial<OutletPayload>) => api.patch<{ outlet: Outlet } | { updated: boolean }>(`/outlets/${id}`, payload),
  enable: (id: string, reason: string) => api.post<{ updated: boolean }>(`/outlets/${id}/enable`, { reason }),
  disable: (id: string, reason: string) => api.post<{ updated: boolean }>(`/outlets/${id}/disable`, { reason }),
};
