import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { AdvanceFilters, AdvancePayment, AdvancePayload } from "./advances.types";

export const advancesApi = {
  list: (filters: AdvanceFilters = {}) => api.get<AdvancePayment[]>(`/advances${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ advance: AdvancePayment }>(`/advances/${id}`),
  create: (payload: AdvancePayload) => api.post<{ advance?: AdvancePayment }>("/advances", payload),
  update: (id: string, payload: Partial<AdvancePayload>) => api.patch<{ advance?: AdvancePayment }>(`/advances/${id}`, payload),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/advances/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ rejected: boolean }>(`/advances/${id}/reject`, { reason }),
};
