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

export type AttendancePayrollImpact = "PAID" | "UNPAID" | "DEDUCT" | "NO_IMPACT" | "REVIEW_REQUIRED";

export interface AttendanceCalendarResponse {
  employee: {
    id: string;
    name: string;
    employee_no: string | null;
    profile_photo_url?: string | null;
    department_id: string | null;
    department_name: string | null;
    position_id: string | null;
    position_name: string | null;
    level: number | null;
    outlet_id: string | null;
    store_id: string | null;
  };
  payroll_period: {
    id: string | null;
    start_date: string;
    end_date: string;
    pay_date: string;
    status: string;
    attendance_locked: boolean;
    is_derived: boolean;
  };
  summary: Record<
    | "payroll_days"
    | "worked_days"
    | "present_days"
    | "late_days"
    | "leave_days"
    | "sick_days"
    | "absent_days"
    | "day_off_days"
    | "holiday_days"
    | "missing_punch_days"
    | "pending_correction_days"
    | "approved_correction_days"
    | "deduction_days"
    | "payable_days"
    | "review_required_days",
    number
  >;
  days: AttendanceCalendarDay[];
  warnings: string[];
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
  shift: { id: string; name: string | null; start_time: string | null; end_time: string | null; status: string | null } | null;
  attendance: { check_in: string | null; check_out: string | null; late_minutes: number; worked_minutes: number } | null;
  leave: { id: string; leave_type: string | null; is_paid: boolean; affects_payroll: boolean; status: string } | null;
  correction: { id: string; status: string; correction_type: string | null } | null;
  holiday: { id: string; name: string | null; is_paid: boolean } | null;
  notes: string[];
}

export interface AttendanceCalendarFilters {
  employee_id?: string;
  month?: string;
  payroll_period_id?: string;
}
