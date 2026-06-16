export type RosterMatrixStatus =
  | "SHIFT_ASSIGNED"
  | "DAY_OFF"
  | "LEAVE"
  | "SICK"
  | "HOLIDAY"
  | "ABSENT_OVERLAY"
  | "PENDING_CHANGE"
  | "APPROVED_CHANGE"
  | "CONFLICT"
  | "DOUBLE_BOOKED"
  | "OUTSIDE_EMPLOYMENT"
  | "NOT_ACTIVE"
  | "EMPTY";

export type RosterMatrixChangeAction = "ASSIGN_SHIFT" | "CHANGE_SHIFT" | "CLEAR_SHIFT" | "MARK_DAY_OFF";

export interface RosterWeeklyMatrixQuery {
  week_start?: string;
  department_id?: string;
  outlet_id?: string;
  store_id?: string;
  search?: string;
  shift_id?: string;
  status?: RosterMatrixStatus;
}

export interface RosterMatrixEmployeeOption {
  id: string;
  employee_no: string | null;
  name: string;
  department_name: string | null;
  position_name: string | null;
  level: number | null;
  outlet_name: string | null;
  store_name: string | null;
  status: string | null;
}

export interface RosterMatrixShiftOption {
  id: string;
  name: string;
  code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  department_id: string | null;
  outlet_id: string | null;
}

export interface RosterMatrixEmployeeRecord {
  id: string;
  employee_code: string | null;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  level: number | null;
  primary_outlet_id: string | null;
  outlet_name: string | null;
  joined_at: string | null;
  resigned_at: string | null;
  terminated_at: string | null;
  employment_status: string | null;
  deleted_at: string | null;
  archived_at: string | null;
}

export interface RosterMatrixAssignmentRecord {
  id: string;
  employee_id: string;
  roster_date: string;
  status: string;
  shift_template_id: string | null;
  shift_name: string | null;
  shift_code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  source: string | null;
  published_at: string | null;
  open_conflict_count: number;
  blocking_conflict_count: number;
}

export interface RosterMatrixPendingChangeRecord {
  id: string;
  employee_id: string | null;
  shift_id: string | null;
  requested_date: string | null;
  change_type: string;
  requested_value_json: string | null;
  status: string;
  approval_status: string | null;
}

export interface RosterMatrixAttendanceOverlayRecord {
  employee_id: string;
  attendance_date: string;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number | null;
  worked_minutes: number | null;
  pending_correction_count: number;
  approved_correction_count: number;
}

export interface RosterMatrixConflict {
  code: string;
  severity: "warning" | "error";
  message: string;
  employee_id?: string;
  date?: string;
  assignment_id?: string | null;
}

export interface RosterMatrixAssignmentChange {
  employee_id: string;
  date: string;
  action: RosterMatrixChangeAction;
  shift_template_id?: string | null;
  assignment_id?: string | null;
  reason?: string | null;
  note?: string | null;
  override_conflicts?: boolean;
}

export interface RosterMatrixChangePayload {
  week_start?: string;
  department_id?: string | null;
  outlet_id?: string | null;
  changes: RosterMatrixAssignmentChange[];
  reason?: string | null;
}

export interface RosterWeeklyMatrixResponse {
  week: {
    start_date: string;
    end_date: string;
    days: Array<{ date: string; label: string; is_today: boolean; is_holiday: boolean }>;
  };
  scope: {
    department_id: string | null;
    department_name: string | null;
    outlet_id: string | null;
    outlet_name: string | null;
  };
  summary: {
    total_employees: number;
    assigned_shifts: number;
    open_cells: number;
    day_off_cells: number;
    leave_conflicts: number;
    double_bookings: number;
    pending_changes: number;
    published_assignments: number;
    draft_assignments: number;
  };
  shifts: RosterMatrixShiftOption[];
  employees: Array<{
    id: string;
    employee_no: string | null;
    name: string;
    department_name: string | null;
    position_name: string | null;
    level: number | null;
    contracted_work_type: string | null;
    cells: Array<{
      date: string;
      status: RosterMatrixStatus;
      label: string;
      assignment_id: string | null;
      shift: { id: string | null; name: string | null; start_time: string | null; end_time: string | null } | null;
      is_draft: boolean;
      is_published: boolean;
      is_locked: boolean;
      leave: { id: string; leave_type: string | null; status: string } | null;
      holiday: { id: string; name: string | null } | null;
      attendance_overlay: {
        status: string | null;
        label: string;
        check_in: string | null;
        check_out: string | null;
        late_minutes: number | null;
        worked_minutes: number | null;
        pending_correction: boolean;
        approved_correction: boolean;
        review_required: boolean;
      } | null;
      pending_change: { id: string; status: string; change_type: string } | null;
      warnings: string[];
      errors: string[];
    }>;
  }>;
  permissions: {
    can_edit: boolean;
    can_submit: boolean;
    can_apply: boolean;
    can_bulk_assign: boolean;
    can_override_conflicts: boolean;
  };
  warnings: string[];
}
