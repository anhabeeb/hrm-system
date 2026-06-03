import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { DeviceFilters, DeviceHealthLog, DeviceMutationResult, DeviceRecord, DeviceReasonPayload, RegisterDevicePayload } from "./devices.types";

export const devicesApi = {
  list: (filters: DeviceFilters = {}) => api.get<DeviceRecord[]>(`/devices${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ device: DeviceRecord } | DeviceRecord>(`/devices/${id}`),
  register: (payload: RegisterDevicePayload) => api.post<DeviceMutationResult>("/devices/register", payload),
  update: (id: string, payload: Partial<RegisterDevicePayload>) => api.patch<DeviceMutationResult>(`/devices/${id}`, payload),
  enable: (id: string, payload: DeviceReasonPayload) => api.post<DeviceMutationResult>(`/devices/${id}/enable`, payload),
  disable: (id: string, payload: DeviceReasonPayload) => api.post<DeviceMutationResult>(`/devices/${id}/disable`, payload),
  rotateToken: (id: string, payload: DeviceReasonPayload) => api.post<DeviceMutationResult>(`/devices/${id}/rotate-token`, payload),
  health: (id: string, filters: DeviceFilters = {}) => api.get<DeviceHealthLog[]>(`/devices/${id}/health${buildQueryString(filters)}`),
  reportsHealth: () => api.get<Record<string, unknown>>("/reports/devices/health", { suppressSessionExpired: true }),
};
