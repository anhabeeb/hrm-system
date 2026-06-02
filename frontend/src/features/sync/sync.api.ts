import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { SyncBatch, SyncConflict, SyncFilters, SyncReasonPayload, SyncStatusSummary } from "./sync.types";

export const SYNC_ITEMS_ENDPOINT_CONNECTED = false;

export const syncApi = {
  status: (filters: SyncFilters = {}) => api.get<SyncStatusSummary>(`/sync/status${buildQueryString(filters)}`),
  reportsStatus: () => api.get<Record<string, unknown>>("/reports/sync/status", { suppressSessionExpired: true }),
  listBatches: (filters: SyncFilters = {}) => api.get<SyncBatch[]>(`/sync/batches${buildQueryString(filters)}`),
  getBatch: (id: string) => api.get<{ batch: SyncBatch; items?: unknown[] } | SyncBatch>(`/sync/batches/${id}`),
  listConflicts: (filters: SyncFilters = {}) => api.get<SyncConflict[]>(`/sync/conflicts${buildQueryString(filters)}`),
  getConflict: (id: string) => api.get<{ conflict: SyncConflict } | SyncConflict>(`/sync/conflicts/${id}`),
  resolveConflict: (id: string, payload: SyncReasonPayload) => api.post<{ resolved: boolean }>(`/sync/conflicts/${id}/resolve`, payload),
  forceResync: (payload: SyncReasonPayload) => api.post<{ requested: boolean }>("/sync/force-resync", payload),
  retry: (payload: SyncReasonPayload & { batch_id?: string; sync_item_id?: string }) => api.post<{ requested: boolean }>("/sync/retry", payload),
  health: (filters: SyncFilters = {}) => api.get<Record<string, unknown>>(`/sync/health${buildQueryString(filters)}`),
};
