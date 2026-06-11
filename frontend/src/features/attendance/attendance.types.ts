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
  classification?: string | null;
  expected_start?: string | null;
  expected_end?: string | null;
  first_clock_in?: string | null;
  last_clock_out?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
  worked_minutes?: number;
  absence_minutes?: number;
  is_incomplete?: number;
  warnings_json?: string | null;
  source_references_json?: string | null;
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
  employee_code?: string;
  department_id?: string | null;
  position_id?: string | null;
  level?: number | null;
  attendance_date?: string;
  requested_date?: string;
  correction_type: string;
  requested_by_name?: string;
  requested_by?: string;
  status: string;
  approval_status?: string | null;
  approval_request_id?: string | null;
  approval_current_step?: string | null;
  approval_current_step_name?: string | null;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  applied_at?: string | null;
  reason?: string;
  created_at?: string;
}

export interface AttendanceCorrectionTimeline {
  correction: AttendanceCorrection;
  request?: {
    id: string;
    status: string;
    current_step_id?: string | null;
  } | null;
  steps: Array<{
    id: string;
    step_name?: string | null;
    step_code?: string | null;
    status: string;
    fallback_applied?: string | null;
  }>;
  actions: Array<{
    id: string;
    action: string;
    actor_user_id?: string | null;
    actor_name?: string | null;
    reason?: string | null;
  }>;
}

export interface AttendanceConflict {
  id: string;
  employee_id?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  conflict_type: string;
  message?: string | null;
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
  from_date?: string;
  to_date?: string;
  date?: string;
  month?: string;
  outlet_id?: string;
  employee_id?: string;
  department_id?: string;
  position_id?: string;
  status?: string;
  attendance_status?: string;
  exception_type?: string;
  issue_type?: string;
  source?: string;
  event_type?: string;
  device_id?: string;
  sync_status?: string;
  late_only?: boolean;
  early_checkout_only?: boolean;
  missing_checkin_only?: boolean;
  missing_checkout_only?: boolean;
  absent_only?: boolean;
  overtime_only?: boolean;
  leave_related_only?: boolean;
  holiday_related_only?: boolean;
  include_details?: boolean;
  page?: number;
  page_size?: number;
}

export interface AttendanceReportResponse<T> {
  success?: boolean;
  data: T[];
  meta?: {
    report: string;
    generated_at: string;
    row_count: number;
    source_tables?: string[];
  };
  filters?: AttendanceFilters;
  pagination?: Pagination;
  generated_at?: string;
  message?: string;
}

export interface AttendanceReportRow {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  outlet_name?: string;
  department_name?: string;
  position_name?: string;
  attendance_date?: string;
  report_date?: string;
  roster_shift_name?: string | null;
  roster_shift_code?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  crosses_midnight?: number;
  first_clock_in?: string | null;
  last_clock_out?: string | null;
  worked_minutes?: number;
  break_minutes?: number;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
  missing_check_in?: number;
  missing_check_out?: number;
  absent?: number;
  leave_flag?: number;
  holiday_flag?: number;
  attendance_status?: string;
  open_exception_count?: number;
  manual_correction?: number;
  source_summary?: string | null;
  device_name?: string | null;
  days_scheduled?: number;
  days_present?: number;
  days_absent?: number;
  leave_days?: number;
  holiday_days?: number;
  late_days?: number;
  early_checkout_days?: number;
  missing_punch_days?: number;
  overtime_days?: number;
  total_worked_minutes?: number;
  total_scheduled_minutes?: number;
  total_late_minutes?: number;
  total_early_checkout_minutes?: number;
  total_overtime_minutes?: number;
  attendance_percentage?: number;
  exception_count?: number;
  payroll_impact_warning?: string | null;
  exception_type?: string;
  severity?: string;
  status?: string;
  message?: string;
  recommended_action?: string;
  source_type?: string;
  source_id?: string;
  biometric_user_id?: string;
  device_id?: string;
  device_code?: string | null;
  device_type?: string;
  device_timestamp?: string;
  server_received_at?: string;
  punch_type?: string;
  source_endpoint?: string;
  duplicate?: number;
  attendance_event_id?: string | null;
  resolution_reason?: string | null;
  total_employees_in_scope?: number;
  present?: number;
  late?: number;
  missing_punches?: number;
  overtime?: number;
  unmatched_device_punches?: number;
  exceptions_open?: number;
  devices_offline_count?: number;
  events?: Array<{
    id: string;
    employee_id?: string;
    event_date?: string;
    event_type?: string;
    event_time?: string;
    source?: string;
    attendance_method?: string;
    device_id?: string | null;
    source_device_id?: string | null;
    source_event_id?: string | null;
    device_name?: string | null;
    approval_status?: string;
    sync_status?: string;
  }>;
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
  outlet_id?: string;
  attendance_date: string;
  correction_type: string;
  reason: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  requested_status?: string;
  new_value_json?: Record<string, unknown>;
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
