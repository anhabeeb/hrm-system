import type { Pagination } from "@/types/api";

export interface AttendanceSummary {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  full_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  attendance_date?: string;
  date?: string;
  status: string;
  first_clock_in?: string | null;
  last_clock_out?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
  worked_minutes?: number;
  issue_type?: string;
  issues?: string[] | string;
}

export interface AttendanceEvent {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  full_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  event_type: string;
  event_time: string;
  source?: string;
  attendance_method?: string;
  device_id?: string | null;
  sync_status?: string;
  approval_status?: string;
  created_at?: string;
}

export interface AttendanceCorrection {
  id: string;
  employee_id?: string;
  employee_name?: string;
  attendance_date?: string;
  correction_type: string;
  requested_by_name?: string;
  requested_by?: string;
  status: string;
  reason?: string;
  created_at?: string;
}

export interface AttendanceConflict {
  id: string;
  employee_id?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  conflict_type: string;
  source?: string;
  severity?: string;
  status: string;
  attendance_date?: string;
  event_time?: string;
  created_at?: string;
}

export interface AttendanceFilters {
  date_from?: string;
  date_to?: string;
  outlet_id?: string;
  employee_id?: string;
  department_id?: string;
  status?: string;
  issue_type?: string;
  source?: string;
  event_type?: string;
  device_id?: string;
  sync_status?: string;
  page?: number;
  page_size?: number;
}

export interface ManualAttendancePayload {
  employee_id: string;
  outlet_id?: string;
  attendance_date: string;
  clock_in_time?: string;
  clock_out_time?: string;
  status?: string;
  reason: string;
  note?: string;
}

export interface ManualAttendanceBatchEntry {
  employee_id: string;
  clock_in_time?: string;
  clock_out_time?: string;
  status?: string;
  note?: string;
}

export interface ManualAttendanceBatchPayload {
  outlet_id: string;
  attendance_date: string;
  reason: string;
  entries: ManualAttendanceBatchEntry[];
}

export interface ManualAttendanceBatchRowError {
  index: number;
  employee_id?: string;
  code: string;
  message: string;
}

export interface ManualAttendanceBatchResult {
  outlet_id: string;
  attendance_date: string;
  accepted: Array<{ index: number; employee_id: string; event_ids: string[] }>;
  row_errors: ManualAttendanceBatchRowError[];
}

export interface CorrectionRequestPayload {
  employee_id: string;
  attendance_date: string;
  correction_type: string;
  reason: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
}

export interface ReasonPayload {
  reason: string;
  resolution?: string;
  resolution_notes?: string;
  notes?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination?: Pagination;
}
