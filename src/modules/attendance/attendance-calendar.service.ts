import { resolveModuleFeatureAliases } from "../../config/module-codes";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import * as repository from "./attendance-calendar.repository";
import type {
  AttendanceCalendarDay,
  AttendanceCalendarEmployeeLookupOption,
  AttendanceCalendarEmployeeLookupQuery,
  AttendanceCalendarEmployeeRecord,
  AttendanceCalendarPayrollPeriod,
  AttendanceCalendarQuery,
  AttendanceCalendarResponse,
  AttendanceCalendarStatus,
  AttendancePayrollImpact,
} from "./attendance-calendar.types";

const monthPattern = /^\d{4}-\d{2}$/;
const dayMs = 24 * 60 * 60 * 1000;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayIso = () => isoDate(new Date());
const parseDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addDays = (value: string, days: number) => isoDate(new Date(parseDate(value).getTime() + days * dayMs));
const monthEnd = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${new Date(year, monthNumber, 0).getDate().toString().padStart(2, "0")}`;
};

const normalizeDate = (value: string | null | undefined) => value ? String(value).slice(0, 10) : null;
const normalizedStatus = (value: unknown) => String(value ?? "").toLowerCase();
const isSickLeave = (leave: Record<string, any> | null | undefined) =>
  Boolean(leave && /sick/i.test(String(leave.leave_key ?? leave.leave_name ?? "")));

const statusLabels: Record<AttendanceCalendarStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half Day",
  ABSENT: "Absent",
  LEAVE: "Leave",
  SICK: "Sick Leave",
  DAY_OFF: "Day Off",
  HOLIDAY: "Holiday",
  MISSING_PUNCH: "Missing Punch",
  PENDING_CORRECTION: "Pending Correction",
  APPROVED_CORRECTION: "Approved Correction",
  REJECTED_CORRECTION: "Rejected Correction",
  NOT_SCHEDULED: "Not Scheduled",
  OUTSIDE_PAYROLL_PERIOD: "Outside Payroll Period",
  NOT_ACTIVE: "Not Active",
  REVIEW_REQUIRED: "Review Required",
  NO_RECORD: "No Record",
};

const hasAny = (actor: AuthActor, permissions: string[]) => permissionService.hasAnyPermission(actor, permissions);

const featureEnabled = async (env: Env, actor: AuthActor, moduleCode: string) => {
  const checks = await Promise.all(
    resolveModuleFeatureAliases(moduleCode).map((feature) =>
      settingsService.isFeatureEnabled(env, actor.companyId, feature, actor),
    ),
  );
  return checks.some(Boolean);
};

const validateQuery = (query: AttendanceCalendarQuery) => {
  if (!query.month || !monthPattern.test(query.month)) {
    throw new ValidationError("Please choose a valid calendar month.");
  }
  if (query.payroll_period_id && query.payroll_period_id.length > 80) {
    throw new ValidationError("Please choose a valid payroll period.");
  }
};

const lookupLimit = (value: number | undefined) => Math.min(Math.max(Number(value ?? 20) || 20, 1), 50);

const calendarLookupScope = async (env: Env, actor: AuthActor) => {
  if (actor.isSuperAdmin || actor.isAdmin || hasAny(actor, ["attendance.calendar.viewAll", "employees.view", "payroll.attendanceReview.view", "payroll.view"])) {
    return { scope: "broad" as const, actorEmployee: null };
  }
  const actorEmployee = await repository.findActorLinkedEmployee(env, actor);
  if (!actorEmployee) return { scope: "none" as const, actorEmployee: null };
  if (hasAny(actor, ["attendance.calendar.viewTeam", "department.attendance.view"])) {
    return { scope: "team" as const, actorEmployee };
  }
  if (hasAny(actor, ["attendance.calendar.view", "attendance.view", "attendance.reports.view", "self.attendance.calendar.view", "self.attendance.view"])) {
    return { scope: "own" as const, actorEmployee };
  }
  return { scope: "none" as const, actorEmployee };
};

export const listAttendanceCalendarEmployees = async (
  env: Env,
  actor: AuthActor,
  query: AttendanceCalendarEmployeeLookupQuery,
): Promise<AttendanceCalendarEmployeeLookupOption[]> => {
  const allowed = query.mode === "payroll"
    ? ["payroll.attendanceReview.view", "payroll.view"]
    : ["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view", "payroll.attendanceReview.view"];
  if (!hasAny(actor, allowed)) throw new PermissionError("You do not have permission to search attendance calendar employees.");
  const { scope, actorEmployee } = await calendarLookupScope(env, actor);
  return repository.listCalendarEmployees(env, actor, {
    search: query.search?.trim() || undefined,
    departmentId: query.department_id?.trim() || undefined,
    outletId: query.outlet_id?.trim() || undefined,
    limit: lookupLimit(query.limit),
    actorEmployee,
    scope,
  });
};

export const deriveDefaultPayrollPeriod = (month: string): AttendanceCalendarPayrollPeriod => ({
  id: null,
  start_date: `${month}-01`,
  end_date: monthEnd(month),
  pay_date: monthEnd(month),
  status: "OPEN",
  attendance_locked: false,
  is_derived: true,
});

export const getPayrollPeriodForCalendar = async (
  env: Env,
  actor: AuthActor,
  query: AttendanceCalendarQuery,
): Promise<AttendanceCalendarPayrollPeriod> =>
  (await repository.findPayrollRunForCalendar(env, actor.companyId, query.month, query.payroll_period_id)) ??
  deriveDefaultPayrollPeriod(query.month);

const employeeActiveOnDate = (employee: AttendanceCalendarEmployeeRecord, date: string) => {
  const joined = normalizeDate(employee.joined_at);
  const resigned = normalizeDate(employee.resigned_at);
  const terminated = normalizeDate(employee.terminated_at);
  if (joined && date < joined) return false;
  if (resigned && date > resigned) return false;
  if (terminated && date > terminated) return false;
  return true;
};

const dateInRange = (date: string, start?: string | null, end?: string | null) =>
  Boolean(start && end && start <= date && end >= date);

const mapByDate = <T extends Record<string, any>>(rows: T[], dateKey: string) => {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const date = normalizeDate(row[dateKey]);
    if (date && !map.has(date)) map.set(date, row);
  });
  return map;
};

const listByDateRange = <T extends Record<string, any>>(rows: T[], date: string, startKey: string, endKey: string) =>
  rows.find((row) => dateInRange(date, normalizeDate(row[startKey]), normalizeDate(row[endKey])));

const correctionForDate = (corrections: Array<Record<string, any>>, date: string) =>
  corrections.find((row) => normalizeDate(row.requested_date ?? row.created_at) === date) ?? null;

const eventsForDate = (events: Array<Record<string, any>>, date: string) =>
  events.filter((event) => normalizeDate(event.event_time) === date);

export const resolvePayrollImpact = (
  status: AttendanceCalendarStatus,
  leave?: Record<string, any> | null,
  holiday?: Record<string, any> | null,
): AttendancePayrollImpact => {
  if (["NOT_ACTIVE", "OUTSIDE_PAYROLL_PERIOD", "DAY_OFF", "NOT_SCHEDULED", "NO_RECORD"].includes(status)) return "NO_IMPACT";
  if (status === "ABSENT") return "DEDUCT";
  if (["MISSING_PUNCH", "PENDING_CORRECTION", "REVIEW_REQUIRED"].includes(status)) return "REVIEW_REQUIRED";
  if (status === "LEAVE" || status === "SICK") {
    if (leave && (Number(leave.is_paid ?? 1) === 0 || Number(leave.affects_payroll ?? 0) === 1 && Number(leave.is_paid ?? 1) === 0)) return "DEDUCT";
    return "PAID";
  }
  if (status === "HOLIDAY") return Number(holiday?.is_paid ?? 1) === 1 ? "PAID" : "NO_IMPACT";
  return "PAID";
};

export const resolveAttendanceDayStatus = (input: {
  date: string;
  inPayrollPeriod: boolean;
  active: boolean;
  summary?: Record<string, any> | null;
  shift?: Record<string, any> | null;
  leave?: Record<string, any> | null;
  holiday?: Record<string, any> | null;
  correction?: Record<string, any> | null;
  events: Array<Record<string, any>>;
}): AttendanceCalendarStatus => {
  if (!input.inPayrollPeriod) return "OUTSIDE_PAYROLL_PERIOD";
  if (!input.active) return "NOT_ACTIVE";

  const correctionStatus = normalizedStatus(input.correction?.status);
  if (["applied", "approved", "completed"].includes(correctionStatus)) return "APPROVED_CORRECTION";
  if (["pending", "submitted", "pending_approval", "pending_department_approval", "pending_hr_approval", "pending_manual_review"].includes(correctionStatus)) return "PENDING_CORRECTION";
  if (["rejected", "cancelled"].includes(correctionStatus)) return "REJECTED_CORRECTION";

  if (input.leave) return isSickLeave(input.leave) ? "SICK" : "LEAVE";
  if (input.holiday) return "HOLIDAY";

  const shiftStatus = normalizedStatus(input.shift?.status);
  if (["day_off", "off", "rest_day"].includes(shiftStatus)) return "DAY_OFF";

  const summaryStatus = normalizedStatus(input.summary?.status);
  if (["missing_clock_in", "missing_clock_out", "missing_check_in", "missing_checkout", "conflict"].includes(summaryStatus)) return "MISSING_PUNCH";
  if (["half_day", "half-day"].includes(summaryStatus)) return "HALF_DAY";
  if (summaryStatus === "absent") return "ABSENT";
  if (input.summary?.first_clock_in || input.summary?.last_clock_out || input.events.length > 0) {
    return Number(input.summary?.late_minutes ?? 0) > 0 || summaryStatus === "late" ? "LATE" : "PRESENT";
  }
  if (input.shift) return "ABSENT";
  return "NO_RECORD";
};

export const buildCalendarDays = (input: {
  employee: AttendanceCalendarEmployeeRecord;
  period: AttendanceCalendarPayrollPeriod;
  month: string;
  summaries: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  leaves: Array<Record<string, any>>;
  corrections: Array<Record<string, any>>;
  shifts: Array<Record<string, any>>;
  holidays: Array<Record<string, any>>;
}): AttendanceCalendarDay[] => {
  const summaries = mapByDate(input.summaries, "attendance_date");
  const shifts = mapByDate(input.shifts, "shift_date");
  const today = todayIso();
  const start = `${input.month}-01`;
  const end = monthEnd(input.month);
  const days: AttendanceCalendarDay[] = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const summary = summaries.get(date) ?? null;
    const shift = shifts.get(date) ?? null;
    const leave = listByDateRange(input.leaves, date, "start_date", "end_date") ?? null;
    const holiday = listByDateRange(input.holidays, date, "start_date", "end_date") ?? null;
    const correction = correctionForDate(input.corrections, date);
    const dayEvents = eventsForDate(input.events, date);
    const inPayrollPeriod = dateInRange(date, input.period.start_date, input.period.end_date);
    const active = employeeActiveOnDate(input.employee, date);
    const status = resolveAttendanceDayStatus({ date, inPayrollPeriod, active, summary, shift, leave, holiday, correction, events: dayEvents });
    const parsed = parseDate(date);
    const payrollImpact = resolvePayrollImpact(status, leave, holiday);
    const notes: string[] = [];
    if (input.period.attendance_locked) notes.push("This payroll period is locked/finalized.");
    if (status === "NO_RECORD") notes.push("No attendance records found for this day.");
    if (status === "PENDING_CORRECTION") notes.push("Attendance correction is pending approval.");
    if (status === "MISSING_PUNCH") notes.push("Missing punch requires review.");

    days.push({
      date,
      day_name: parsed.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      status,
      label: statusLabels[status],
      payroll_impact: payrollImpact,
      is_payroll_period_day: inPayrollPeriod,
      is_today: date === today,
      is_weekend: [0, 6].includes(parsed.getUTCDay()),
      is_employee_active_day: active,
      shift: shift
        ? {
            id: String(shift.id),
            name: shift.shift_name ?? null,
            start_time: shift.start_time ?? null,
            end_time: shift.end_time ?? null,
            status: shift.status ?? null,
          }
        : null,
      attendance: summary || dayEvents.length > 0
        ? {
            check_in: summary?.first_clock_in ?? dayEvents.find((event) => /in/i.test(String(event.event_type)))?.event_time ?? null,
            check_out: summary?.last_clock_out ?? dayEvents.find((event) => /out/i.test(String(event.event_type)))?.event_time ?? null,
            late_minutes: Number(summary?.late_minutes ?? 0),
            worked_minutes: Number(summary?.worked_minutes ?? 0),
          }
        : null,
      leave: leave
        ? {
            id: String(leave.id),
            leave_type: leave.leave_name ?? leave.leave_key ?? null,
            is_paid: Number(leave.is_paid ?? 1) === 1,
            affects_payroll: Number(leave.affects_payroll ?? 0) === 1,
            status: String(leave.status ?? "approved"),
          }
        : null,
      correction: correction
        ? {
            id: String(correction.id),
            status: String(correction.status),
            correction_type: correction.correction_type ?? null,
          }
        : null,
      holiday: holiday
        ? {
            id: String(holiday.id),
            name: holiday.holiday_name ?? null,
            is_paid: Number(holiday.is_paid ?? 1) === 1,
          }
        : null,
      notes,
    });
  }

  return days;
};

export const getAttendanceSummary = (days: AttendanceCalendarDay[]) => {
  const count = (predicate: (day: AttendanceCalendarDay) => boolean) => days.filter(predicate).length;
  return {
    payroll_days: count((day) => day.is_payroll_period_day),
    worked_days: count((day) => ["PRESENT", "LATE", "HALF_DAY", "APPROVED_CORRECTION"].includes(day.status)),
    present_days: count((day) => ["PRESENT", "APPROVED_CORRECTION"].includes(day.status)),
    late_days: count((day) => day.status === "LATE"),
    leave_days: count((day) => day.status === "LEAVE"),
    sick_days: count((day) => day.status === "SICK"),
    absent_days: count((day) => day.status === "ABSENT"),
    day_off_days: count((day) => day.status === "DAY_OFF"),
    holiday_days: count((day) => day.status === "HOLIDAY"),
    missing_punch_days: count((day) => day.status === "MISSING_PUNCH"),
    pending_correction_days: count((day) => day.status === "PENDING_CORRECTION"),
    approved_correction_days: count((day) => day.status === "APPROVED_CORRECTION"),
    deduction_days: count((day) => day.payroll_impact === "DEDUCT"),
    payable_days: count((day) => day.payroll_impact === "PAID"),
    review_required_days: count((day) => day.payroll_impact === "REVIEW_REQUIRED" || day.status === "REVIEW_REQUIRED"),
  };
};

export const assertCanViewEmployeeAttendanceCalendar = async (
  env: Env,
  actor: AuthActor,
  employee: AttendanceCalendarEmployeeRecord,
  permissions: string[],
) => {
  if (!hasAny(actor, permissions)) {
    throw new PermissionError("You do not have permission to view this attendance calendar.");
  }
  if (actor.isSuperAdmin || actor.isAdmin || hasAny(actor, ["attendance.calendar.viewAll", "employees.view", "payroll.attendanceReview.view"])) return;

  const actorEmployee = await repository.findActorLinkedEmployee(env, actor);
  if (!actorEmployee) throw new PermissionError("Employee attendance calendar access requires a linked employee profile.");
  if (actorEmployee.id === employee.id && hasAny(actor, ["self.attendance.calendar.view", "self.attendance.view"])) return;
  const canViewTeam = hasAny(actor, ["attendance.calendar.viewTeam", "department.attendance.view"]);
  if (
    canViewTeam &&
    actorEmployee.department_id &&
    actorEmployee.department_id === employee.department_id &&
    Number(actorEmployee.level ?? 0) > Number(employee.level ?? 0)
  ) return;

  throw new PermissionError("You do not have access to this employee attendance calendar.");
};

export const assertCanViewSelfAttendanceCalendar = async (env: Env, actor: AuthActor) => {
  const employee = await repository.findActorLinkedEmployee(env, actor);
  if (!employee || employee.deleted_at || employee.archived_at) {
    throw new PermissionError("Self-service attendance calendar is only available for accounts linked to an employee profile.", "SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED");
  }
  if (!hasAny(actor, ["self.attendance.calendar.view", "self.attendance.view"])) {
    throw new PermissionError("You do not have permission to view your attendance calendar.");
  }
  return employee;
};

export const getEmployeeAttendanceCalendar = async (
  env: Env,
  actor: AuthActor,
  query: AttendanceCalendarQuery,
): Promise<AttendanceCalendarResponse> => {
  validateQuery(query);
  const employeeId = query.mode === "self"
    ? (await assertCanViewSelfAttendanceCalendar(env, actor)).id
    : query.employee_id;
  if (!employeeId) throw new ValidationError("Please select an employee.");

  const employee = await repository.findEmployeeForCalendar(env, actor, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");

  const modePermissions = query.mode === "payroll"
    ? ["payroll.attendanceReview.view", "payroll.view"]
    : query.mode === "employee"
      ? ["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view", "employees.view"]
      : query.mode === "self"
        ? ["self.attendance.calendar.view", "self.attendance.view"]
        : ["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view"];
  await assertCanViewEmployeeAttendanceCalendar(env, actor, employee, modePermissions);

  const period = await getPayrollPeriodForCalendar(env, actor, query);
  const leaveEnabled = await featureEnabled(env, actor, "leave");
  const rosterEnabled = await featureEnabled(env, actor, "roster");
  const holidaysEnabled = await featureEnabled(env, actor, "holidays");
  const startDate = `${query.month}-01`;
  const endDate = monthEnd(query.month);

  const [summaries, events, leaves, corrections, shifts, holidays] = await Promise.all([
    repository.listDailySummaries(env, actor.companyId, employee.id, startDate, endDate),
    repository.listAttendanceEvents(env, actor.companyId, employee.id, startDate, endDate),
    leaveEnabled ? repository.listApprovedLeaves(env, actor.companyId, employee.id, startDate, endDate) : Promise.resolve([]),
    repository.listAttendanceCorrections(env, actor.companyId, employee.id, startDate, endDate),
    rosterEnabled ? repository.listRosterShifts(env, actor.companyId, employee.id, startDate, endDate) : Promise.resolve([]),
    holidaysEnabled ? repository.listHolidays(env, actor.companyId, employee.primary_outlet_id, startDate, endDate) : Promise.resolve([]),
  ]);

  const days = buildCalendarDays({ employee, period, month: query.month, summaries, events, leaves, corrections, shifts, holidays });
  const warnings = [
    period.is_derived ? "Payroll period is not configured. Showing default monthly period." : null,
    period.attendance_locked ? "This payroll period is locked/finalized." : null,
    !leaveEnabled ? "Leave module is disabled; leave and sick overlays are unavailable." : null,
    !rosterEnabled ? "Roster module is disabled; shift and day-off overlays are unavailable." : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    employee: {
      id: employee.id,
      name: employee.full_name,
      employee_no: employee.employee_code,
      department_id: employee.department_id,
      department_name: employee.department_name,
      position_id: employee.position_id,
      position_name: employee.position_name,
      level: employee.level,
      outlet_id: employee.primary_outlet_id,
      store_id: employee.store_id ?? null,
    },
    payroll_period: period,
    summary: getAttendanceSummary(days),
    days,
    warnings,
  };
};

export const getPayrollAttendanceCalendar = (env: Env, actor: AuthActor, query: AttendanceCalendarQuery) =>
  getEmployeeAttendanceCalendar(env, actor, { ...query, mode: "payroll" });

export const getSelfAttendanceCalendar = (env: Env, actor: AuthActor, query: AttendanceCalendarQuery) =>
  getEmployeeAttendanceCalendar(env, actor, { ...query, mode: "self" });
