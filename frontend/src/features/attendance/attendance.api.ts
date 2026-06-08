import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  AttendanceConflict,
  AttendanceCorrection,
  AttendanceEvent,
  AttendanceFilters,
  AttendanceReportResponse,
  AttendanceReportRow,
  AttendanceSummary,
  CorrectionRequestPayload,
  ManualAttendanceBatchPayload,
  ManualAttendanceBatchResult,
  ManualAttendancePayload,
  ReasonPayload,
} from "./attendance.types";

export const attendanceApi = {
  listSummary: (filters: AttendanceFilters = {}) => api.get<AttendanceSummary[]>(`/attendance/summary${buildQueryString(filters)}`),
  listEvents: (filters: AttendanceFilters = {}) => api.get<AttendanceEvent[]>(`/attendance/events${buildQueryString(filters)}`),
  getEvent: (id: string) => api.get<{ event: AttendanceEvent } | AttendanceEvent>(`/attendance/events/${id}`),
  manualEntry: (payload: ManualAttendancePayload) => api.post<{ saved: boolean }>("/attendance/manual-entry", payload),
  manualBatch: (payload: ManualAttendanceBatchPayload) => api.post<ManualAttendanceBatchResult>("/attendance/manual-batch", payload),
  requestCorrection: (payload: CorrectionRequestPayload) => api.post<{ correction_id?: string }>("/attendance/correction-request", payload),
  listCorrections: (filters: AttendanceFilters = {}) => api.get<AttendanceCorrection[]>(`/attendance/corrections${buildQueryString(filters)}`),
  approveCorrection: (id: string, payload: ReasonPayload) => api.post<{ approved: boolean }>(`/attendance/corrections/${id}/approve`, payload),
  rejectCorrection: (id: string, payload: ReasonPayload) => api.post<{ rejected: boolean }>(`/attendance/corrections/${id}/reject`, payload),
  listConflicts: (filters: AttendanceFilters = {}) => api.get<AttendanceConflict[]>(`/attendance/conflicts${buildQueryString(filters)}`),
  resolveConflict: (id: string, payload: ReasonPayload) => api.post<{ resolved: boolean }>(`/attendance/conflicts/${id}/resolve`, payload),
  reports: {
    daily: (filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/daily${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
    monthly: (filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/monthly${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
    employee: (employeeId: string, filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/employee/${employeeId}${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
    exceptions: (filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/exceptions${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
    devicePunches: (filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/device-punches${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
    summary: (filters: AttendanceFilters = {}) => api.get<AttendanceReportRow[]>(`/attendance/reports/summary${buildQueryString(filters)}`) as Promise<AttendanceReportResponse<AttendanceReportRow>>,
  },
};
