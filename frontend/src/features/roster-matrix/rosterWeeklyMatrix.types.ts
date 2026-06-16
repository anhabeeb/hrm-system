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

export type RosterMatrixAction = "ASSIGN_SHIFT" | "CHANGE_SHIFT" | "CLEAR_SHIFT" | "MARK_DAY_OFF";

export interface RosterWeeklyMatrixFilters {
  week_start?: string;
  department_id?: string;
  outlet_id?: string;
  search?: string;
  shift_id?: string;
  status?: RosterMatrixStatus | "";
}

export interface RosterMatrixShift {
  id: string;
  name: string;
  code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  department_id: string | null;
  outlet_id: string | null;
}

export interface RosterMatrixCell {
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
}

export interface RosterMatrixEmployee {
  id: string;
  employee_no: string | null;
  name: string;
  department_name: string | null;
  position_name: string | null;
  level: number | null;
  contracted_work_type: string | null;
  cells: RosterMatrixCell[];
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
  shifts: RosterMatrixShift[];
  employees: RosterMatrixEmployee[];
  permissions: {
    can_edit: boolean;
    can_submit: boolean;
    can_apply: boolean;
    can_bulk_assign: boolean;
    can_override_conflicts: boolean;
  };
  warnings: string[];
}

export interface RosterMatrixChange {
  employee_id: string;
  date: string;
  action: RosterMatrixAction;
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
  changes: RosterMatrixChange[];
  reason?: string | null;
}

export interface RosterMatrixValidationResult {
  valid: boolean;
  errors: Array<{ code: string; severity: "error"; message: string; employee_id?: string; date?: string }>;
  warnings: Array<{ code: string; severity: "warning"; message: string; employee_id?: string; date?: string }>;
  conflict_summary: { error_count: number; warning_count: number };
}
