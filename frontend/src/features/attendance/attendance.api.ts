import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  AttendanceConflict,
  AttendanceCorrection,
  AttendanceEvent,
  AttendanceFilters,
  AttendanceSummary,
  CorrectionRequestPayload,
  ManualAttendancePayload,
  ReasonPayload,
} from "./attendance.types";

export const attendanceApi = {
  listSummary: (filters: AttendanceFilters = {}) => api.get<AttendanceSummary[]>(`/attendance/summary${buildQueryString(filters)}`),
  listEvents: (filters: AttendanceFilters = {}) => api.get<AttendanceEvent[]>(`/attendance/events${buildQueryString(filters)}`),
  getEvent: (id: string) => api.get<{ event: AttendanceEvent } | AttendanceEvent>(`/attendance/events/${id}`),
  manualEntry: (payload: ManualAttendancePayload) => api.post<{ saved: boolean }>("/attendance/manual-entry", payload),
  requestCorrection: (payload: CorrectionRequestPayload) => api.post<{ correction_id?: string }>("/attendance/correction-request", payload),
  listCorrections: (filters: AttendanceFilters = {}) => api.get<AttendanceCorrection[]>(`/attendance/corrections${buildQueryString(filters)}`),
  approveCorrection: (id: string, payload: ReasonPayload) => api.post<{ approved: boolean }>(`/attendance/corrections/${id}/approve`, payload),
  rejectCorrection: (id: string, payload: ReasonPayload) => api.post<{ rejected: boolean }>(`/attendance/corrections/${id}/reject`, payload),
  listConflicts: (filters: AttendanceFilters = {}) => api.get<AttendanceConflict[]>(`/attendance/conflicts${buildQueryString(filters)}`),
  resolveConflict: (id: string, payload: ReasonPayload) => api.post<{ resolved: boolean }>(`/attendance/conflicts/${id}/resolve`, payload),
};
