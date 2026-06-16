import type { AttendanceCalendarStatus } from "../attendance/attendance-calendar.types";

export interface DepartmentWeeklyTeamQuery {
  department_id?: string;
  week_start?: string;
  outlet_id?: string;
  store_id?: string;
  search?: string;
  status?: AttendanceCalendarStatus;
  self_service?: boolean;
}

export interface DepartmentWeeklyTeamDepartmentOption {
  id: string;
  name: string;
}

export interface DepartmentWeeklyDay {
  date: string;
  label: string;
  is_today: boolean;
  is_holiday: boolean;
}

export interface DepartmentWeeklyCell {
  date: string;
  status: AttendanceCalendarStatus;
  label: string;
  shift: { id: string; name: string | null; start_time: string | null; end_time: string | null } | null;
  attendance: { check_in: string | null; check_out: string | null; late_minutes: number; worked_minutes: number } | null;
  leave: { id: string; leave_type: string | null; status: string } | null;
  correction: { id: string; status: string; correction_type: string | null } | null;
  holiday: { id: string; name: string | null } | null;
  warnings: string[];
}

export interface DepartmentWeeklyEmployee {
  id: string;
  employee_no: string | null;
  name: string;
  department_name: string | null;
  position_name: string | null;
  level: number | null;
  cells: DepartmentWeeklyCell[];
}

export interface DepartmentWeeklyTeamResponse {
  week: {
    start_date: string;
    end_date: string;
    days: DepartmentWeeklyDay[];
  };
  department: {
    id: string | null;
    name: string | null;
  };
  summary: Record<
    | "total_employees"
    | "scheduled_this_week"
    | "present_today"
    | "late_today"
    | "absent_today"
    | "on_leave_today"
    | "sick_today"
    | "day_off_today"
    | "missing_punches"
    | "pending_corrections"
    | "roster_conflicts",
    number | null
  > & { understaffed_days: number | null };
  employees: DepartmentWeeklyEmployee[];
  warnings: string[];
}
