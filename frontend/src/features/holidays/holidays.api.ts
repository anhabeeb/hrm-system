import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { HolidayFilters, HolidayPayload, HolidayRecord, HolidaySettings, HolidaySettingsPayload } from "./holidays.types";

export const holidaysApi = {
  list: (filters: HolidayFilters = {}) => api.get<HolidayRecord[]>(`/holidays${buildQueryString(filters)}`),
  calendar: (filters: HolidayFilters = {}) => api.get<{ events: HolidayRecord[]; range: Record<string, string>; summary: Record<string, number> }>(`/holidays/calendar${buildQueryString(filters)}`),
  range: (filters: HolidayFilters = {}) => api.get<{ events: HolidayRecord[]; range: Record<string, string>; summary: Record<string, number> }>(`/holidays/range${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ holiday: HolidayRecord }>(`/holidays/${id}`),
  create: (payload: HolidayPayload) => api.post<{ holiday: HolidayRecord }>("/holidays", payload),
  update: (id: string, payload: Partial<HolidayPayload>) => api.patch<{ holiday: HolidayRecord }>(`/holidays/${id}`, payload),
  archive: (id: string, reason: string) => api.post<{ holiday: HolidayRecord }>(`/holidays/${id}/archive`, { reason }),
  restore: (id: string, reason: string) => api.post<{ holiday: HolidayRecord }>(`/holidays/${id}/restore`, { reason }),
  settings: () => api.get<{ settings: HolidaySettings }>("/holidays/settings"),
  updateSettings: (payload: HolidaySettingsPayload) => api.patch<{ settings: HolidaySettings }>("/holidays/settings", payload),
};
