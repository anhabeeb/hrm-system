import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  BiometricDevice,
  BiometricDevicePayload,
  BiometricFilters,
  BiometricLog,
  BiometricMapping,
  BiometricMappingPayload,
  BiometricMutationResult,
  BiometricReasonPayload,
} from "./biometric.types";

export const biometricApi = {
  listDevices: (filters: BiometricFilters = {}) => api.get<BiometricDevice[]>(`/biometric/devices${buildQueryString(filters)}`),
  getDevice: (id: string) => api.get<{ device: BiometricDevice } | BiometricDevice>(`/biometric/devices/${id}`),
  createDevice: (payload: BiometricDevicePayload) => api.post<BiometricMutationResult>("/biometric/devices", payload),
  updateDevice: (id: string, payload: Partial<BiometricDevicePayload>) => api.patch<BiometricMutationResult>(`/biometric/devices/${id}`, payload),
  enableDevice: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/devices/${id}/enable`, payload),
  disableDevice: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/devices/${id}/disable`, payload),
  revokeDevice: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/devices/${id}/revoke`, payload),
  rotateDeviceToken: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/devices/${id}/rotate-token`, payload),
  listMappings: (filters: BiometricFilters = {}) => api.get<BiometricMapping[]>(`/biometric/mappings${buildQueryString(filters)}`),
  createMapping: (payload: BiometricMappingPayload) => api.post<BiometricMutationResult>("/biometric/mappings", payload),
  updateMapping: (id: string, payload: Partial<BiometricMappingPayload>) => api.patch<BiometricMutationResult>(`/biometric/mappings/${id}`, payload),
  disableMapping: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/mappings/${id}/disable`, payload),
  listLogs: (filters: BiometricFilters = {}) => api.get<BiometricLog[]>(`/biometric/logs${buildQueryString(filters)}`),
  getLog: (id: string) => api.get<{ log: BiometricLog } | BiometricLog>(`/biometric/logs/${id}`),
  listUnmatched: (filters: BiometricFilters = {}) => api.get<BiometricLog[]>(`/biometric/unmatched${buildQueryString(filters)}`),
  mapUnmatched: (logId: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/unmatched/${logId}/map`, payload),
  reprocessLog: (id: string, payload: BiometricReasonPayload) => api.post<{ reprocessed: boolean }>(`/biometric/logs/${id}/reprocess`, payload),
  rejectLog: (id: string, payload: BiometricReasonPayload) => api.post<BiometricMutationResult>(`/biometric/logs/${id}/reject`, payload),
};
