import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { AssetAssignPayload, AssetDeduction, AssetDeductionFilters, AssetDeductionPayload, AssetFilters, AssetMarkPayload, AssetPayload, AssetRecord, AssetReturnPayload } from "./assets.types";

export const assetsApi = {
  list: (filters: AssetFilters = {}) => api.get<AssetRecord[]>(`/assets${buildQueryString(filters)}`),
  get: (id: string) => api.get<AssetRecord>(`/assets/${id}`),
  create: (payload: AssetPayload) => api.post<AssetRecord>("/assets", payload),
  update: (id: string, payload: Partial<AssetPayload>) => api.patch<AssetRecord>(`/assets/${id}`, payload),
  assign: (id: string, payload: AssetAssignPayload) => api.post<AssetRecord>(`/assets/${id}/assign`, payload),
  returnAsset: (id: string, payload: AssetReturnPayload) => api.post<AssetRecord>(`/assets/${id}/return`, payload),
  markLost: (id: string, payload: AssetMarkPayload) => api.post<AssetRecord>(`/assets/${id}/mark-lost`, payload),
  markDamaged: (id: string, payload: AssetMarkPayload) => api.post<AssetRecord>(`/assets/${id}/mark-damaged`, payload),
  requestDeduction: (id: string, payload: AssetDeductionPayload) => api.post<AssetDeduction>(`/assets/${id}/request-deduction`, payload),
  pendingReturn: (filters: AssetFilters = {}) => api.get<AssetRecord[]>(`/assets/pending-return${buildQueryString(filters)}`),
  deductions: (filters: AssetDeductionFilters = {}) => api.get<AssetDeduction[]>(`/assets/deductions${buildQueryString(filters)}`),
  approveDeduction: (id: string, reason: string) => api.post<AssetDeduction>(`/assets/deductions/${id}/approve`, { reason }),
  rejectDeduction: (id: string, reason: string) => api.post<AssetDeduction>(`/assets/deductions/${id}/reject`, { reason }),
};
