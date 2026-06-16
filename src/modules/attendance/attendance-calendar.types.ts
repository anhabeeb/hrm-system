export type AttendanceCalendarStatus =
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
  | "OUTSIDE_PAYROLL_PERIOD"
  | "NOT_ACTIVE"
  | "REVIEW_REQUIRED"
  | "NO_RECORD";

export type AttendancePayrollImpact =
  | "PAID"
  | "UNPAID"
  | "DEDUCT"
  | "NO_IMPACT"
  | "REVIEW_REQUIRED";

export interface AttendanceCalendarQuery {
  employee_id?: string;
  month: string;
  payroll_period_id?: string;
  mode?: "attendance" | "employee" | "payroll" | "self";
}

export interface AttendanceCalendarEmployeeLookupQuery {
  search?: string;
  department_id?: string;
  outlet_id?: string;
  limit?: number;
  mode?: "attendance" | "payroll";
}

export interface AttendanceCalendarEmployeeLookupOption {
  id: string;
  code: string | null;
  name: string;
  label: string;
  department_name: string | null;
  position_name: string | null;
  level: number | null;
  outlet_name: string | null;
  store_name: string | null;
  status: string | null;
}

export interface AttendanceCalendarEmployee {
  id: string;
  name: string;
  employee_no: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  level: number | null;
  outlet_id: string | null;
  store_id: string | null;
}

export interface AttendanceCalendarPayrollPeriod {
  id: string | null;
  start_date: string;
  end_date: string;
  pay_date: string;
  status: string;
  attendance_locked: boolean;
  is_derived: boolean;
}

export interface AttendanceCalendarDay {
  date: string;
  day_name: string;
  status: AttendanceCalendarStatus;
  label: string;
  payroll_impact: AttendancePayrollImpact;
  is_payroll_period_day: boolean;
  is_today: boolean;
  is_weekend: boolean;
  is_employee_active_day: boolean;
  shift: {
    id: string;
    name: string | null;
    start_time: string | null;
    end_time: string | null;
    status: string | null;
  } | null;
  attendance: {
    check_in: string | null;
    check_out: string | null;
    late_minutes: number;
    worked_minutes: number;
  } | null;
  leave: {
    id: string;
    leave_type: string | null;
    is_paid: boolean;
    affects_payroll: boolean;
    status: string;
  } | null;
  correction: {
    id: string;
    status: string;
    correction_type: string | null;
  } | null;
  holiday: {
    id: string;
    name: string | null;
    is_paid: boolean;
  } | null;
  notes: string[];
}

export interface AttendanceCalendarSummary {
  payroll_days: number;
  worked_days: number;
  present_days: number;
  late_days: number;
  leave_days: number;
  sick_days: number;
  absent_days: number;
  day_off_days: number;
  holiday_days: number;
  missing_punch_days: number;
  pending_correction_days: number;
  approved_correction_days: number;
  deduction_days: number;
  payable_days: number;
  review_required_days: number;
}

export interface AttendanceCalendarResponse {
  employee: AttendanceCalendarEmployee;
  payroll_period: AttendanceCalendarPayrollPeriod;
  summary: AttendanceCalendarSummary;
  days: AttendanceCalendarDay[];
  warnings: string[];
}

export interface AttendanceCalendarEmployeeRecord {
  id: string;
  employee_code: string | null;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  level: number | null;
  primary_outlet_id: string | null;
  store_id?: string | null;
  joined_at: string | null;
  resigned_at?: string | null;
  terminated_at?: string | null;
  employment_status: string | null;
  deleted_at: string | null;
  archived_at: string | null;
}

export interface AttendanceCalendarSourceRows {
  summaries: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  leaves: Array<Record<string, any>>;
  corrections: Array<Record<string, any>>;
  shifts: Array<Record<string, any>>;
  holidays: Array<Record<string, any>>;
}
