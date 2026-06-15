import type {
  ROSTER_CONFLICT_SEVERITIES,
  ROSTER_CONFLICT_STATUSES,
  ROSTER_CONFLICT_TYPES,
  ROSTER_STATUSES,
  SHIFT_TEMPLATE_STATUSES,
} from "./rosters.constants";

export type RosterStatus = (typeof ROSTER_STATUSES)[number];
export type ShiftTemplateStatus = (typeof SHIFT_TEMPLATE_STATUSES)[number];
export type RosterConflictType = (typeof ROSTER_CONFLICT_TYPES)[number];
export type RosterConflictSeverity = (typeof ROSTER_CONFLICT_SEVERITIES)[number];
export type RosterConflictStatus = (typeof ROSTER_CONFLICT_STATUSES)[number];

export const ROSTER_CHANGE_TYPES = [
  "SHIFT_CREATE",
  "SHIFT_UPDATE",
  "SHIFT_DELETE",
  "SHIFT_SWAP",
  "DAY_OFF_REQUEST",
  "DAY_OFF_CHANGE",
  "SHIFT_TIME_CHANGE",
  "OUTLET_SHIFT_CHANGE",
  "ROSTER_PUBLISH_CHANGE",
  "ROSTER_UNPUBLISH_CHANGE",
  "BULK_ROSTER_CHANGE",
  "GENERAL_ROSTER_CHANGE",
] as const;

export const ROSTER_CHANGE_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_DEPARTMENT_APPROVAL",
  "PENDING_HR_APPROVAL",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "APPLIED",
  "FAILED_TO_APPLY",
] as const;

export type RosterChangeType = (typeof ROSTER_CHANGE_TYPES)[number];
export type RosterChangeStatus = (typeof ROSTER_CHANGE_STATUSES)[number];

export interface ShiftTemplateRecord {
  id: string;
  company_id: string;
  outlet_id?: string | null;
  department_id?: string | null;
  name: string;
  code?: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  crosses_midnight: number;
  active: number;
  status: ShiftTemplateStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_by?: string | null;
  updated_at: string;
}

export interface RosterShiftRecord {
  id: string;
  company_id: string;
  outlet_id: string;
  outlet_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  employee_id: string;
  employee_code?: string | null;
  employee_name?: string | null;
  shift_template_id?: string | null;
  shift_template_name?: string | null;
  shift_template_code?: string | null;
  shift_date?: string;
  roster_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: RosterStatus;
  notes?: string | null;
  source: string;
  published_at?: string | null;
  published_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_by?: string | null;
  updated_at: string;
  open_conflict_count?: number;
  blocking_conflict_count?: number;
}

export interface RosterConflictRecord {
  id: string;
  company_id: string;
  roster_shift_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  outlet_id?: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  conflict_type: RosterConflictType;
  severity: RosterConflictSeverity;
  message: string;
  status: RosterConflictStatus;
  detected_at: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface RosterEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  employee_type?: string | null;
  employment_status: string;
  primary_outlet_id: string | null;
  department_id?: string | null;
  position_id?: string | null;
  level?: number | null;
  joined_at?: string | null;
  resigned_at?: string | null;
  terminated_at?: string | null;
  deleted_at?: string | null;
}

export interface RosterChangeRequestRecord {
  id: string;
  company_id: string;
  employee_id: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  level: number | null;
  outlet_id: string | null;
  outlet_name?: string | null;
  store_id: string | null;
  roster_id: string | null;
  shift_id: string | null;
  source_roster_id: string | null;
  target_roster_id: string | null;
  source_shift_id: string | null;
  target_shift_id: string | null;
  change_type: RosterChangeType;
  requested_date: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  requested_break_start: string | null;
  requested_break_end: string | null;
  current_value_json: string | null;
  requested_value_json: string | null;
  reason: string;
  employee_note: string | null;
  manager_note: string | null;
  hr_note: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  status: RosterChangeStatus;
  department_approved_at: string | null;
  department_approved_by: string | null;
  hr_approved_at: string | null;
  hr_approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  applied_at: string | null;
  applied_by: string | null;
  apply_error_code: string | null;
  apply_error_message: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  current_step_name?: string | null;
}

export interface RosterChangeRequestInput {
  employee_id?: string | null;
  roster_id?: string | null;
  shift_id?: string | null;
  source_roster_id?: string | null;
  target_roster_id?: string | null;
  source_shift_id?: string | null;
  target_shift_id?: string | null;
  change_type: RosterChangeType;
  requested_date?: string | null;
  requested_start_at?: string | null;
  requested_end_at?: string | null;
  requested_break_start?: string | null;
  requested_break_end?: string | null;
  requested_value_json?: Record<string, unknown> | null;
  reason: string;
  employee_note?: string | null;
  manager_note?: string | null;
  override_warnings?: boolean;
}

export interface RosterChangeFilters {
  employee_id?: string;
  department_id?: string;
  outlet_id?: string;
  status?: string;
  approval_status?: string;
  requested_date?: string;
  page: number;
  page_size: number;
}

export interface ShiftTemplateInput {
  outlet_id?: string | null;
  department_id?: string | null;
  name: string;
  code?: string | null;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  crosses_midnight?: boolean;
  notes?: string | null;
}

export type ShiftTemplateUpdateInput = Partial<ShiftTemplateInput> & { reason?: string };

export interface RosterShiftInput {
  outlet_id: string;
  department_id?: string | null;
  position_id?: string | null;
  employee_id: string;
  shift_template_id?: string | null;
  roster_date: string;
  start_time?: string;
  end_time?: string;
  break_minutes?: number;
  notes?: string | null;
  reason?: string;
  override_warnings?: boolean;
}

export interface RosterShiftUpdateInput extends Partial<Omit<RosterShiftInput, "employee_id">> {
  employee_id?: string;
  status?: RosterStatus;
}

export interface RosterBulkInput {
  outlet_id: string;
  department_id?: string | null;
  position_id?: string | null;
  employee_ids: string[];
  date_from: string;
  date_to: string;
  days_of_week: number[];
  shift_template_id: string;
  notes?: string | null;
  reason?: string;
  override_warnings?: boolean;
}

export interface RosterPublishInput {
  outlet_id: string;
  department_id?: string | null;
  date_from: string;
  date_to: string;
  reason: string;
}

export interface RosterActionInput {
  reason: string;
  notes?: string | null;
}

export interface RosterListFilters {
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  conflict_status?: string;
  page: number;
  page_size: number;
}

export interface ShiftTemplateFilters {
  outlet_id?: string;
  department_id?: string;
  status?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface RosterConflictFilters {
  outlet_id?: string;
  department_id?: string;
  employee_id?: string;
  severity?: string;
  status?: string;
  conflict_type?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface RosterSettings {
  roster_module_enabled: boolean;
  allow_roster_overlap_override: boolean;
  allow_scheduling_on_leave: boolean;
  allow_scheduling_on_holidays: boolean;
  allow_scheduling_suspended_employee: boolean;
  require_publish_before_attendance: boolean;
  roster_publish_required: boolean;
  default_shift_break_minutes: number;
  roster_conflict_warning_days: number;
}
