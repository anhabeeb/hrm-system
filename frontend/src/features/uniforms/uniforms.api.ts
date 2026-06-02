import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { UniformFilters, UniformIssuePayload, UniformRecord, UniformReturnPayload } from "./uniforms.types";

export const uniformsApi = {
  list: (filters: UniformFilters = {}) => api.get<UniformRecord[]>(`/uniforms${buildQueryString(filters)}`),
  get: (id: string) => api.get<UniformRecord>(`/uniforms/${id}`),
  issue: (payload: UniformIssuePayload) => api.post<UniformRecord>("/uniforms/issue", payload),
  returnUniform: (id: string, payload: UniformReturnPayload) => api.post<UniformRecord>(`/uniforms/${id}/return`, payload),
  pendingReturn: (filters: UniformFilters = {}) => api.get<UniformRecord[]>(`/uniforms/pending-return${buildQueryString(filters)}`),
};
