export interface ShiftTemplate {
  id: string;
  name: string;
  code?: string | null;
  outlet_id?: string | null;
  department_id?: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  crosses_midnight: number;
  active: number;
  status: "active" | "inactive";
  notes?: string | null;
}

export interface RosterShift {
  id: string;
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
  roster_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: "draft" | "published" | "cancelled" | "completed";
  notes?: string | null;
  source: string;
  published_at?: string | null;
  open_conflict_count?: number;
  blocking_conflict_count?: number;
}

export interface RosterConflict {
  id: string;
  roster_shift_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  outlet_id?: string | null;
  outlet_name?: string | null;
  conflict_type: string;
  severity: "warning" | "error";
  message: string;
  status: "open" | "resolved" | "overridden";
  detected_at: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

export interface RosterFilters {
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  conflict_status?: string;
  page?: number;
  page_size?: number;
}

export interface RosterPayload {
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

export interface BulkRosterPayload {
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

export interface ShiftTemplatePayload {
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
