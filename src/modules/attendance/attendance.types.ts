import type {
  ATTENDANCE_CONFLICT_TYPES,
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_METHODS,
  ATTENDANCE_SORT_FIELDS,
  ATTENDANCE_SOURCES,
  ATTENDANCE_SUMMARY_STATUSES,
} from "./attendance.constants";

export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];
export type AttendanceSummaryStatus = (typeof ATTENDANCE_SUMMARY_STATUSES)[number];
export type AttendanceConflictType = (typeof ATTENDANCE_CONFLICT_TYPES)[number];
export type AttendanceSortField = (typeof ATTENDANCE_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export interface AttendanceOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface AttendanceListFilters {
  date_from?: string;
  date_to?: string;
  attendance_date?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  status?: string;
  event_type?: AttendanceEventType;
  attendance_method?: AttendanceMethod;
  source?: AttendanceSource;
  sync_status?: string;
  approval_status?: string;
  page: number;
  page_size: number;
  sort_by: AttendanceSortField;
  sort_direction: SortDirection;
}

export interface AttendanceEventRecord {
  id: string;
  company_id: string;
  employee_id: string;
  outlet_id: string;
  device_id: string | null;
  event_type: AttendanceEventType;
  event_time: string;
  attendance_method: AttendanceMethod;
  source: AttendanceSource;
  local_id: string | null;
  created_offline: number;
  sync_status: string;
  approval_status: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSummaryRecord {
  id: string;
  company_id: string;
  employee_id: string;
  outlet_id: string;
  attendance_date: string;
  first_clock_in: string | null;
  last_clock_out: string | null;
  worked_minutes: number;
  late_minutes: number;
  early_out_minutes: number;
  break_minutes: number;
  overtime_minutes: number;
  status: AttendanceSummaryStatus;
  payroll_status: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceListRow extends AttendanceSummaryRecord {
  employee_code: string;
  employee_name: string;
  outlet_name: string | null;
  sync_status: string | null;
  actions_available: string;
}

export interface AttendanceEventInput {
  employee_id: string;
  outlet_id: string;
  event_time?: string;
  attendance_method?: AttendanceMethod;
  reason?: string;
}

export interface ManualEntryInput {
  employee_id: string;
  outlet_id: string;
  attendance_date: string;
  clock_in_time?: string;
  clock_out_time?: string;
  status?: AttendanceSummaryStatus;
  reason: string;
  notes?: string;
}

export interface CorrectionRequestInput {
  employee_id: string;
  attendance_event_id?: string;
  correction_type: string;
  old_value_json?: Record<string, unknown>;
  new_value_json: Record<string, unknown>;
  reason: string;
}

export interface ReviewInput {
  reason: string;
}

export interface ConflictResolveInput {
  resolution: "accept" | "reject" | "merge" | "ignore";
  reason: string;
}

export interface KioskClockInput {
  employee_id: string;
  event_time?: string;
  attendance_method?: "pin" | "qr" | "kiosk";
  local_id?: string;
}
