export type DepartmentWeeklyStatus =
  | "PRESENT"
  | "LATE"
  | "HALF_DAY"
  | "ABSENT"
  | "LEAVE"
  | "SICK"
  | "DAY_OFF"
  | "HOLIDAY"
  | "MISSING_PUNCH"
  | "PENDING_CORRECTION"
  | "APPROVED_CORRECTION"
  | "REJECTED_CORRECTION"
  | "NOT_SCHEDULED"
  | "NOT_ACTIVE"
  | "REVIEW_REQUIRED"
  | "NO_RECORD";

export interface DepartmentWeeklyCell {
  date: string;
  status: DepartmentWeeklyStatus;
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
  profile_photo_url?: string | null;
  department_name: string | null;
  position_name: string | null;
  level: number | null;
  cells: DepartmentWeeklyCell[];
}

export interface DepartmentWeeklyTeamResponse {
  week: {
    start_date: string;
    end_date: string;
    days: Array<{ date: string; label: string; is_today: boolean; is_holiday: boolean }>;
  };
  department: { id: string | null; name: string | null };
  summary: Record<string, number | null>;
  employees: DepartmentWeeklyEmployee[];
  warnings: string[];
}

export interface DepartmentWeeklyTeamDepartmentOption {
  id: string;
  name: string;
}

export interface DepartmentWeeklyTeamFilters {
  department_id?: string;
  week_start?: string;
  outlet_id?: string;
  search?: string;
  status?: DepartmentWeeklyStatus | "";
}
