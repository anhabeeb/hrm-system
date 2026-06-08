import type { AttendanceEventRecord, AttendanceSummaryStatus } from "./attendance.types";

const DAY_MS = 86_400_000;
const MALDIVES_OFFSET = "+05:00";

export interface AttendanceRuleSettings {
  grace_period_minutes: number;
  late_threshold_minutes: number;
  early_checkout_threshold_minutes: number;
  missed_punch_policy: "incomplete" | "absent" | "warning";
  absent_if_no_check_in: boolean;
  absent_if_no_check_out: boolean;
  allow_overtime: boolean;
  overtime_requires_approval: boolean;
  overtime_rounding_minutes: number;
  minimum_overtime_minutes: number;
  require_roster_for_attendance: boolean;
  require_publish_before_attendance: boolean;
  roster_publish_required: boolean;
  use_default_shift_when_no_roster: boolean;
  default_shift_start_time: string;
  default_shift_end_time: string;
  default_break_minutes: number;
  require_complete_attendance_before_payroll: boolean;
  missing_attendance_counts_as_absent: boolean;
  correction_approval_required: boolean;
  correction_deadline_days: number;
  manual_attendance_requires_reason: boolean;
}

export interface ExpectedShift {
  id?: string | null;
  roster_date: string;
  start_time: string;
  end_time: string;
  break_minutes?: number | null;
  status?: string | null;
  source?: string | null;
}

export interface ApprovedLeaveForDay {
  id: string;
  is_paid: number;
  affects_payroll: number;
}

export interface HolidayForDay {
  id: string;
  holiday_name?: string | null;
  is_paid?: number | null;
}

export interface EmployeeAttendanceState {
  id: string;
  employment_status?: string | null;
  joined_at?: string | null;
  resigned_at?: string | null;
  terminated_at?: string | null;
}

export interface AttendanceDayClassificationInput {
  employeeId: string;
  date: string;
  rosterShift?: ExpectedShift | null;
  unpublishedRosterShift?: ExpectedShift | null;
  attendanceEvents: AttendanceEventRecord[];
  approvedLeave?: ApprovedLeaveForDay | null;
  holiday?: HolidayForDay | null;
  settings: AttendanceRuleSettings;
  employee?: EmployeeAttendanceState | null;
}

export interface AttendanceRuleConflict {
  type:
    | "missing_clock_in"
    | "missing_clock_out"
    | "incomplete_attendance"
    | "overtime_pending_approval"
    | "attendance_on_leave"
    | "attendance_outside_roster"
    | "missing_roster";
  severity: "warning" | "error";
  message: string;
}

export interface AttendanceDayClassification {
  date: string;
  classification:
    | "present"
    | "late"
    | "early_checkout"
    | "late_and_early_checkout"
    | "absent"
    | "paid_leave"
    | "unpaid_leave"
    | "holiday"
    | "rest_day"
    | "incomplete"
    | "missed_check_in"
    | "missed_check_out"
    | "overtime"
    | "suspended"
    | "not_employed";
  summary_status: AttendanceSummaryStatus;
  expected_start: string | null;
  expected_end: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  late_minutes: number;
  early_checkout_minutes: number;
  overtime_minutes: number;
  break_minutes: number;
  worked_minutes: number;
  absence_minutes: number;
  is_paid_leave: boolean;
  is_unpaid_leave: boolean;
  is_holiday: boolean;
  is_rest_day: boolean;
  is_incomplete: boolean;
  warnings: string[];
  rule_conflicts: AttendanceRuleConflict[];
  source_references: string[];
}

export const DEFAULT_ATTENDANCE_RULE_SETTINGS: AttendanceRuleSettings = {
  grace_period_minutes: 5,
  late_threshold_minutes: 0,
  early_checkout_threshold_minutes: 0,
  missed_punch_policy: "incomplete",
  absent_if_no_check_in: false,
  absent_if_no_check_out: false,
  allow_overtime: false,
  overtime_requires_approval: true,
  overtime_rounding_minutes: 1,
  minimum_overtime_minutes: 0,
  require_roster_for_attendance: false,
  require_publish_before_attendance: false,
  roster_publish_required: false,
  use_default_shift_when_no_roster: true,
  default_shift_start_time: "09:00",
  default_shift_end_time: "17:00",
  default_break_minutes: 60,
  require_complete_attendance_before_payroll: false,
  missing_attendance_counts_as_absent: false,
  correction_approval_required: true,
  correction_deadline_days: 7,
  manual_attendance_requires_reason: true,
};

const dateTime = (date: string, time: string) => `${date}T${time}:00${MALDIVES_OFFSET}`;

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const minutesBetween = (start: string, end: string) =>
  Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));

const timeMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const expectedWindow = (date: string, rosterShift: ExpectedShift | null | undefined, settings: AttendanceRuleSettings) => {
  const startTime = rosterShift?.start_time ?? (settings.use_default_shift_when_no_roster ? settings.default_shift_start_time : null);
  const endTime = rosterShift?.end_time ?? (settings.use_default_shift_when_no_roster ? settings.default_shift_end_time : null);
  if (!startTime || !endTime) return null;
  const endDate = timeMinutes(endTime) <= timeMinutes(startTime) ? addDays(date, 1) : date;
  return {
    start: dateTime(date, startTime),
    end: dateTime(endDate, endTime),
    break_minutes: rosterShift?.break_minutes ?? settings.default_break_minutes,
    sourceId: rosterShift?.id ?? "default_shift",
  };
};

const firstClockIn = (events: AttendanceEventRecord[]) =>
  events.find((event) => event.event_type === "clock_in") ?? null;

const lastClockOut = (events: AttendanceEventRecord[]) =>
  [...events].reverse().find((event) => event.event_type === "clock_out") ?? null;

const roundOvertime = (minutes: number, settings: AttendanceRuleSettings) => {
  if (minutes < settings.minimum_overtime_minutes) return 0;
  const rounding = Math.max(1, settings.overtime_rounding_minutes);
  return Math.floor(minutes / rounding) * rounding;
};

const isDateBefore = (date: string, value?: string | null) =>
  Boolean(value && date < value.slice(0, 10));

const isDateAfter = (date: string, value?: string | null) =>
  Boolean(value && date > value.slice(0, 10));

export const normalizeAttendanceRuleSettings = (raw: Record<string, unknown> = {}): AttendanceRuleSettings => {
  const numberValue = (key: string, fallback: number) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const boolValue = (key: string, fallback: boolean) =>
    typeof raw[key] === "boolean" ? Boolean(raw[key]) : fallback;

  return {
    grace_period_minutes: numberValue("grace_period_minutes", numberValue("late_grace_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.grace_period_minutes)),
    late_threshold_minutes: numberValue("late_threshold_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.late_threshold_minutes),
    early_checkout_threshold_minutes: numberValue("early_checkout_threshold_minutes", numberValue("early_out_grace_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.early_checkout_threshold_minutes)),
    missed_punch_policy: ["incomplete", "absent", "warning"].includes(String(raw.missed_punch_policy))
      ? raw.missed_punch_policy as AttendanceRuleSettings["missed_punch_policy"]
      : DEFAULT_ATTENDANCE_RULE_SETTINGS.missed_punch_policy,
    absent_if_no_check_in: boolValue("absent_if_no_check_in", DEFAULT_ATTENDANCE_RULE_SETTINGS.absent_if_no_check_in),
    absent_if_no_check_out: boolValue("absent_if_no_check_out", DEFAULT_ATTENDANCE_RULE_SETTINGS.absent_if_no_check_out),
    allow_overtime: boolValue("allow_overtime", boolValue("overtime_enabled", DEFAULT_ATTENDANCE_RULE_SETTINGS.allow_overtime)),
    overtime_requires_approval: boolValue("overtime_requires_approval", boolValue("overtime_approval_required", DEFAULT_ATTENDANCE_RULE_SETTINGS.overtime_requires_approval)),
    overtime_rounding_minutes: numberValue("overtime_rounding_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.overtime_rounding_minutes),
    minimum_overtime_minutes: numberValue("minimum_overtime_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.minimum_overtime_minutes),
    require_roster_for_attendance: boolValue("require_roster_for_attendance", DEFAULT_ATTENDANCE_RULE_SETTINGS.require_roster_for_attendance),
    require_publish_before_attendance: boolValue("require_publish_before_attendance", DEFAULT_ATTENDANCE_RULE_SETTINGS.require_publish_before_attendance),
    roster_publish_required: boolValue("roster_publish_required", DEFAULT_ATTENDANCE_RULE_SETTINGS.roster_publish_required),
    use_default_shift_when_no_roster: boolValue("use_default_shift_when_no_roster", DEFAULT_ATTENDANCE_RULE_SETTINGS.use_default_shift_when_no_roster),
    default_shift_start_time: typeof raw.default_shift_start_time === "string" ? raw.default_shift_start_time : DEFAULT_ATTENDANCE_RULE_SETTINGS.default_shift_start_time,
    default_shift_end_time: typeof raw.default_shift_end_time === "string" ? raw.default_shift_end_time : DEFAULT_ATTENDANCE_RULE_SETTINGS.default_shift_end_time,
    default_break_minutes: numberValue("default_break_minutes", DEFAULT_ATTENDANCE_RULE_SETTINGS.default_break_minutes),
    require_complete_attendance_before_payroll: boolValue("require_complete_attendance_before_payroll", DEFAULT_ATTENDANCE_RULE_SETTINGS.require_complete_attendance_before_payroll),
    missing_attendance_counts_as_absent: boolValue("missing_attendance_counts_as_absent", DEFAULT_ATTENDANCE_RULE_SETTINGS.missing_attendance_counts_as_absent),
    correction_approval_required: boolValue("correction_approval_required", boolValue("attendance_correction_approval_required", DEFAULT_ATTENDANCE_RULE_SETTINGS.correction_approval_required)),
    correction_deadline_days: numberValue("correction_deadline_days", DEFAULT_ATTENDANCE_RULE_SETTINGS.correction_deadline_days),
    manual_attendance_requires_reason: boolValue("manual_attendance_requires_reason", boolValue("require_reason_for_manual_attendance", DEFAULT_ATTENDANCE_RULE_SETTINGS.manual_attendance_requires_reason)),
  };
};

export const classifyEmployeeAttendanceDay = (input: AttendanceDayClassificationInput): AttendanceDayClassification => {
  const warnings: string[] = [];
  const ruleConflicts: AttendanceRuleConflict[] = [];
  const sourceReferences = input.attendanceEvents.map((event) => event.id);
  const expected = expectedWindow(input.date, input.rosterShift, input.settings);
  if (expected?.sourceId) sourceReferences.push(expected.sourceId);
  if (input.holiday) sourceReferences.push(input.holiday.id);
  const publishedRosterRequired = input.settings.require_publish_before_attendance || input.settings.roster_publish_required;
  const rosterRequired = input.settings.require_roster_for_attendance || publishedRosterRequired;
  if (!input.rosterShift && rosterRequired) {
    const severity = input.settings.use_default_shift_when_no_roster ? "warning" : "error";
    if (input.attendanceEvents.length > 0) {
      const message = publishedRosterRequired && input.unpublishedRosterShift
        ? "Attendance was recorded before the roster was published."
        : "Attendance was recorded without a rostered shift.";
      warnings.push(message);
      ruleConflicts.push({ type: "attendance_outside_roster", severity, message });
    } else {
      const message = publishedRosterRequired
        ? "No published roster shift is available for this attendance date."
        : "No rostered shift is available for this attendance date.";
      warnings.push(message);
      ruleConflicts.push({ type: "missing_roster", severity, message });
    }
  }

  const base = {
    date: input.date,
    expected_start: expected?.start ?? null,
    expected_end: expected?.end ?? null,
    actual_check_in: null,
    actual_check_out: null,
    late_minutes: 0,
    early_checkout_minutes: 0,
    overtime_minutes: 0,
    break_minutes: expected?.break_minutes ?? 0,
    worked_minutes: 0,
    absence_minutes: expected ? minutesBetween(expected.start, expected.end) - (expected.break_minutes ?? 0) : 0,
    is_paid_leave: false,
    is_unpaid_leave: false,
    is_holiday: Boolean(input.holiday),
    is_rest_day: false,
    is_incomplete: false,
    warnings,
    rule_conflicts: ruleConflicts,
    source_references: sourceReferences,
  };

  if (input.employee?.joined_at && isDateBefore(input.date, input.employee.joined_at)) {
    return { ...base, classification: "not_employed", summary_status: "off_day", is_rest_day: true };
  }
  if (isDateAfter(input.date, input.employee?.terminated_at) || isDateAfter(input.date, input.employee?.resigned_at)) {
    return { ...base, classification: "not_employed", summary_status: "off_day", is_rest_day: true };
  }
  if (input.employee?.employment_status === "suspended") {
    return { ...base, classification: "suspended", summary_status: "off_day", is_rest_day: true, warnings: [...warnings, "Employee is suspended on this date."] };
  }
  if (input.approvedLeave) {
    sourceReferences.push(input.approvedLeave.id);
    if (input.attendanceEvents.length > 0) {
      const message = "Attendance was recorded while the employee was on approved leave.";
      warnings.push(message);
      ruleConflicts.push({ type: "attendance_on_leave", severity: "warning", message });
    }
    const paid = input.approvedLeave.is_paid === 1 || input.approvedLeave.affects_payroll !== 1;
    return {
      ...base,
      classification: paid ? "paid_leave" : "unpaid_leave",
      summary_status: "on_leave",
      is_paid_leave: paid,
      is_unpaid_leave: !paid,
      absence_minutes: paid ? 0 : base.absence_minutes,
    };
  }
  if (input.holiday && input.attendanceEvents.length === 0) {
    return { ...base, classification: "holiday", summary_status: "holiday", is_holiday: true, absence_minutes: 0 };
  }
  if (input.holiday && input.attendanceEvents.length > 0) {
    warnings.push(`Attendance was recorded on a holiday${input.holiday.holiday_name ? `: ${input.holiday.holiday_name}` : ""}.`);
  }
  if (!expected && input.attendanceEvents.length === 0) {
    if (input.settings.missing_attendance_counts_as_absent) {
      return { ...base, classification: "absent", summary_status: "absent" };
    }
    return { ...base, classification: "incomplete", summary_status: "conflict", is_incomplete: true, warnings: [...warnings, "No roster/default shift or attendance events are available."] };
  }

  const clockIn = firstClockIn(input.attendanceEvents);
  const clockOut = lastClockOut(input.attendanceEvents);
  const explicitAbsent = input.attendanceEvents.some((event) => event.event_type === "manual_entry" && event.approval_status === "absent");

  if (!clockIn && !clockOut) {
    if (explicitAbsent || input.settings.missing_attendance_counts_as_absent || input.settings.missed_punch_policy === "absent") {
      return { ...base, classification: "absent", summary_status: "absent" };
    }
    if (!expected) return { ...base, classification: "rest_day", summary_status: "off_day", is_rest_day: true, absence_minutes: 0 };
    const message = "No attendance punches are recorded.";
    return {
      ...base,
      classification: "incomplete",
      summary_status: "conflict",
      is_incomplete: true,
      warnings: [...warnings, message],
      rule_conflicts: [
        ...ruleConflicts,
        {
          type: "incomplete_attendance",
          severity: input.settings.missed_punch_policy === "warning" ? "warning" : "error",
          message,
        },
      ],
    };
  }
  if (!clockIn) {
    const classifyAbsent = input.settings.absent_if_no_check_in || input.settings.missed_punch_policy === "absent";
    const classification = classifyAbsent ? "absent" : "missed_check_in";
    const message = "Clock-in is missing.";
    return {
      ...base,
      classification,
      summary_status: classification === "absent" ? "absent" : "missing_clock_in",
      actual_check_out: clockOut?.event_time ?? null,
      is_incomplete: classification !== "absent",
      warnings: [...warnings, message],
      rule_conflicts: classification === "absent"
        ? ruleConflicts
        : [
            ...ruleConflicts,
            {
              type: "missing_clock_in",
              severity: input.settings.missed_punch_policy === "warning" ? "warning" : "error",
              message,
            },
          ],
    };
  }
  if (!clockOut) {
    const classifyAbsent = input.settings.absent_if_no_check_out || input.settings.missed_punch_policy === "absent";
    const classification = classifyAbsent ? "absent" : "missed_check_out";
    const message = "Clock-out is missing.";
    return {
      ...base,
      classification,
      summary_status: classification === "absent" ? "absent" : "missing_clock_out",
      actual_check_in: clockIn.event_time,
      is_incomplete: classification !== "absent",
      warnings: [...warnings, message],
      rule_conflicts: classification === "absent"
        ? ruleConflicts
        : [
            ...ruleConflicts,
            {
              type: "missing_clock_out",
              severity: input.settings.missed_punch_policy === "warning" ? "warning" : "error",
              message,
            },
          ],
    };
  }

  const workedMinutes = minutesBetween(clockIn.event_time, clockOut.event_time);
  const expectedLateMinutes = expected ? Math.max(0, minutesBetween(expected.start, clockIn.event_time) - input.settings.grace_period_minutes) : 0;
  const lateMinutes = expectedLateMinutes > input.settings.late_threshold_minutes ? expectedLateMinutes : 0;
  const expectedEarlyMinutes = expected ? Math.max(0, minutesBetween(clockOut.event_time, expected.end)) : 0;
  const earlyMinutes = expectedEarlyMinutes > input.settings.early_checkout_threshold_minutes ? expectedEarlyMinutes : 0;
  const rawOvertime = expected ? Math.max(0, minutesBetween(expected.end, clockOut.event_time)) : 0;
  const overtimeMinutes = input.settings.allow_overtime ? roundOvertime(rawOvertime, input.settings) : 0;

  let classification: AttendanceDayClassification["classification"] = "present";
  if (lateMinutes > 0 && earlyMinutes > 0) classification = "late_and_early_checkout";
  else if (lateMinutes > 0) classification = "late";
  else if (earlyMinutes > 0) classification = "early_checkout";
  else if (overtimeMinutes > 0) classification = "overtime";

  if (overtimeMinutes > 0 && input.settings.overtime_requires_approval) {
    const message = "Overtime requires approval before payroll payment.";
    warnings.push(message);
    ruleConflicts.push({ type: "overtime_pending_approval", severity: "warning", message });
  }

  return {
    ...base,
    classification,
    summary_status: "present",
    actual_check_in: clockIn.event_time,
    actual_check_out: clockOut.event_time,
    late_minutes: lateMinutes,
    early_checkout_minutes: earlyMinutes,
    overtime_minutes: overtimeMinutes,
    worked_minutes: workedMinutes,
    absence_minutes: 0,
  };
};
