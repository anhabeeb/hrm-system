import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Position, PositionFilters, PositionPayload } from "./positions.types";

export const positionsApi = {
  list: (filters: PositionFilters = {}) => api.get<Position[]>(`/positions${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ position: Position }>(`/positions/${id}`),
  create: (payload: PositionPayload) => api.post<{ position: Position } | { id: string }>("/positions", payload),
  update: (id: string, payload: Partial<PositionPayload>) => api.patch<{ position: Position } | { updated: boolean }>(`/positions/${id}`, payload),
  delete: (id: string, reason: string) => api.delete<{ deleted: boolean }>(`/positions/${id}`, { reason }),
};
