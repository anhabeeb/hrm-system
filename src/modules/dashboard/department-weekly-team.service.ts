import { resolveModuleFeatureAliases } from "../../config/module-codes";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { PermissionError, ValidationError } from "../../utils/errors";
import * as attendanceRepository from "../attendance/attendance-calendar.repository";
import type { AttendanceCalendarEmployeeRecord, AttendanceCalendarStatus } from "../attendance/attendance-calendar.types";
import * as repository from "./department-weekly-team.repository";
import type { DepartmentWeeklyCell, DepartmentWeeklyTeamDepartmentOption, DepartmentWeeklyTeamQuery, DepartmentWeeklyTeamResponse } from "./department-weekly-team.types";

const dayMs = 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayIso = () => isoDate(new Date());
const parseDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addDays = (value: string, days: number) => isoDate(new Date(parseDate(value).getTime() + days * dayMs));
const mondayOfWeek = (date = todayIso()) => {
  const parsed = parseDate(date);
  const day = parsed.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
};
const hasAny = (actor: AuthActor, permissions: string[]) =>
  permissionService.isSuperAdmin(actor) || permissionService.hasAnyPermission(actor, permissions);
const normalized = (value: unknown) => String(value ?? "").toLowerCase();
const normalizeDate = (value: string | null | undefined) => value ? String(value).slice(0, 10) : null;
const dateInRange = (date: string, start?: string | null, end?: string | null) =>
  Boolean(start && end && start <= date && end >= date);
const isSickLeave = (leave: Record<string, any> | null | undefined) =>
  Boolean(leave && /sick/i.test(String(leave.leave_key ?? leave.leave_name ?? "")));

const labels: Record<AttendanceCalendarStatus, string> = {
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

const featureEnabled = async (env: Env, actor: AuthActor, moduleCode: string) => {
  const checks = await Promise.all(resolveModuleFeatureAliases(moduleCode).map((feature) =>
    settingsService.isFeatureEnabled(env, actor.companyId, feature, actor),
  ));
  return checks.some(Boolean);
};

export const buildWeekDays = (weekStart?: string) => {
  const start = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : mondayOfWeek();
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      label: parseDate(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      is_today: date === todayIso(),
      is_holiday: false,
    };
  });
};

const employeeActiveOnDate = (employee: AttendanceCalendarEmployeeRecord, date: string) => {
  const joined = normalizeDate(employee.joined_at);
  const resigned = normalizeDate(employee.resigned_at);
  const terminated = normalizeDate(employee.terminated_at);
  if (joined && date < joined) return false;
  if (resigned && date > resigned) return false;
  if (terminated && date > terminated) return false;
  return true;
};

const mapByDate = <T extends Record<string, any>>(rows: T[], key: string) => {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const date = normalizeDate(row[key]);
    if (date && !map.has(date)) map.set(date, row);
  });
  return map;
};

const findRange = <T extends Record<string, any>>(rows: T[], date: string, startKey: string, endKey: string) =>
  rows.find((row) => dateInRange(date, normalizeDate(row[startKey]), normalizeDate(row[endKey]))) ?? null;

export const resolveTeamDayStatus = (input: {
  active: boolean;
  summary?: Record<string, any> | null;
  shift?: Record<string, any> | null;
  leave?: Record<string, any> | null;
  holiday?: Record<string, any> | null;
  correction?: Record<string, any> | null;
  events: Array<Record<string, any>>;
}): AttendanceCalendarStatus => {
  if (!input.active) return "NOT_ACTIVE";
  const correctionStatus = normalized(input.correction?.status);
  if (["applied", "approved", "completed"].includes(correctionStatus)) return "APPROVED_CORRECTION";
  if (["pending", "submitted", "pending_approval", "pending_department_approval", "pending_hr_approval", "pending_manual_review"].includes(correctionStatus)) return "PENDING_CORRECTION";
  if (input.leave) return isSickLeave(input.leave) ? "SICK" : "LEAVE";
  if (input.holiday) return "HOLIDAY";
  const shiftStatus = normalized(input.shift?.status);
  if (["day_off", "off", "rest_day"].includes(shiftStatus)) return "DAY_OFF";
  const summaryStatus = normalized(input.summary?.status);
  if (["missing_clock_in", "missing_clock_out", "missing_check_in", "missing_checkout", "conflict"].includes(summaryStatus)) return "MISSING_PUNCH";
  if (["half_day", "half-day"].includes(summaryStatus)) return "HALF_DAY";
  if (summaryStatus === "absent") return "ABSENT";
  if (input.summary?.first_clock_in || input.summary?.last_clock_out || input.events.length > 0) {
    return Number(input.summary?.late_minutes ?? 0) > 0 || summaryStatus === "late" ? "LATE" : "PRESENT";
  }
  if (input.shift) return "ABSENT";
  return "NO_RECORD";
};

export const resolveAllowedDepartmentsForActor = async (env: Env, actor: AuthActor, requestedDepartmentId?: string) => {
  if (actor.isSuperAdmin || actor.isAdmin || hasAny(actor, ["departments.dashboard.viewAll", "employees.view", "attendance.calendar.viewAll"])) {
    if (!requestedDepartmentId) return { departmentId: null, scope: "all" as const, actorEmployee: null };
    return { departmentId: requestedDepartmentId, scope: "all" as const, actorEmployee: null };
  }

  const actorEmployee = await repository.findActorLinkedEmployee(env, actor);
  if (!actorEmployee?.department_id) throw new PermissionError("Department dashboard access requires a linked employee department.");
  if (!hasAny(actor, ["departments.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view", "department.dashboard.view"])) {
    throw new PermissionError("You do not have permission to view this department dashboard.");
  }
  if (requestedDepartmentId && requestedDepartmentId !== actorEmployee.department_id) {
    throw new PermissionError("You do not have permission to view this department.");
  }
  return { departmentId: actorEmployee.department_id, scope: "team" as const, actorEmployee };
};

export const assertCanViewDepartmentWeeklyTeam = async (env: Env, actor: AuthActor, query: DepartmentWeeklyTeamQuery) => {
  if (query.self_service && !actor.actorUserId) throw new PermissionError("Please sign in to continue.");
  if (!hasAny(actor, ["departments.dashboard.view", "departments.dashboard.viewTeam", "departments.dashboard.viewAll", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view", "department.dashboard.view", "employees.view"])) {
    throw new PermissionError("You do not have permission to view department weekly team dashboards.");
  }
  return resolveAllowedDepartmentsForActor(env, actor, query.department_id);
};

const buildEmployeeWeekCells = async (
  env: Env,
  actor: AuthActor,
  employee: AttendanceCalendarEmployeeRecord,
  dates: string[],
  overlays: { leave: boolean; roster: boolean; holidays: boolean },
): Promise<DepartmentWeeklyCell[]> => {
  const start = dates[0];
  const end = dates[dates.length - 1];
  const [summaries, events, leaves, corrections, shifts, holidays] = await Promise.all([
    attendanceRepository.listDailySummaries(env, actor.companyId, employee.id, start, end),
    attendanceRepository.listAttendanceEvents(env, actor.companyId, employee.id, start, end),
    overlays.leave ? attendanceRepository.listApprovedLeaves(env, actor.companyId, employee.id, start, end) : Promise.resolve([]),
    attendanceRepository.listAttendanceCorrections(env, actor.companyId, employee.id, start, end),
    overlays.roster ? attendanceRepository.listRosterShifts(env, actor.companyId, employee.id, start, end) : Promise.resolve([]),
    overlays.holidays ? attendanceRepository.listHolidays(env, actor.companyId, employee.primary_outlet_id, start, end) : Promise.resolve([]),
  ]);
  const summariesByDate = mapByDate(summaries, "attendance_date");
  const shiftsByDate = mapByDate(shifts, "shift_date");

  return dates.map((date) => {
    const summary = summariesByDate.get(date) ?? null;
    const shift = shiftsByDate.get(date) ?? null;
    const leave = findRange(leaves, date, "start_date", "end_date");
    const holiday = findRange(holidays, date, "start_date", "end_date");
    const correction = corrections.find((row) => normalizeDate(row.requested_date ?? row.created_at) === date) ?? null;
    const dayEvents = events.filter((event) => normalizeDate(event.event_time) === date);
    const status = resolveTeamDayStatus({ active: employeeActiveOnDate(employee, date), summary, shift, leave, holiday, correction, events: dayEvents });
    const warnings = [
      status === "PENDING_CORRECTION" ? "Attendance correction is pending approval." : null,
      status === "MISSING_PUNCH" ? "Missing punch requires review." : null,
      status === "NO_RECORD" ? "No attendance records found for this day." : null,
    ].filter((warning): warning is string => Boolean(warning));

    return {
      date,
      status,
      label: labels[status],
      shift: shift ? { id: String(shift.id), name: shift.shift_name ?? null, start_time: shift.start_time ?? null, end_time: shift.end_time ?? null } : null,
      attendance: summary || dayEvents.length ? {
        check_in: summary?.first_clock_in ?? dayEvents.find((event) => /in/i.test(String(event.event_type)))?.event_time ?? null,
        check_out: summary?.last_clock_out ?? dayEvents.find((event) => /out/i.test(String(event.event_type)))?.event_time ?? null,
        late_minutes: Number(summary?.late_minutes ?? 0),
        worked_minutes: Number(summary?.worked_minutes ?? 0),
      } : null,
      leave: leave ? { id: String(leave.id), leave_type: leave.leave_name ?? leave.leave_key ?? null, status: String(leave.status ?? "approved") } : null,
      correction: correction ? { id: String(correction.id), status: String(correction.status), correction_type: correction.correction_type ?? null } : null,
      holiday: holiday ? { id: String(holiday.id), name: holiday.holiday_name ?? null } : null,
      warnings,
    };
  });
};

export const getWeeklyTeamSummary = (employees: Array<{ cells: DepartmentWeeklyCell[] }>) => {
  const today = todayIso();
  const allCells = employees.flatMap((employee) => employee.cells);
  const todayCells = allCells.filter((cell) => cell.date === today);
  const count = (cells: DepartmentWeeklyCell[], status: AttendanceCalendarStatus) => cells.filter((cell) => cell.status === status).length;
  return {
    total_employees: employees.length,
    scheduled_this_week: employees.filter((employee) => employee.cells.some((cell) => Boolean(cell.shift))).length,
    present_today: count(todayCells, "PRESENT") + count(todayCells, "APPROVED_CORRECTION"),
    late_today: count(todayCells, "LATE"),
    absent_today: count(todayCells, "ABSENT"),
    on_leave_today: count(todayCells, "LEAVE"),
    sick_today: count(todayCells, "SICK"),
    day_off_today: count(todayCells, "DAY_OFF"),
    missing_punches: count(allCells, "MISSING_PUNCH"),
    pending_corrections: count(allCells, "PENDING_CORRECTION"),
    roster_conflicts: allCells.filter((cell) => cell.shift && /conflict/i.test(String(cell.shift.name ?? ""))).length,
    understaffed_days: null,
  };
};

const assertDepartmentWeeklyModulesEnabled = async (env: Env, actor: AuthActor) => {
  const employeesEnabled = await featureEnabled(env, actor, "employees");
  const attendanceEnabled = await featureEnabled(env, actor, "attendance");
  if (!employeesEnabled || !attendanceEnabled) throw new PermissionError("This module is currently disabled.");
};

export const listWeeklyTeamDepartments = async (
  env: Env,
  actor: AuthActor,
  query: Pick<DepartmentWeeklyTeamQuery, "self_service"> = {},
): Promise<DepartmentWeeklyTeamDepartmentOption[]> => {
  await assertDepartmentWeeklyModulesEnabled(env, actor);
  const allowed = await assertCanViewDepartmentWeeklyTeam(env, actor, { self_service: query.self_service });
  if (allowed.scope === "all") return repository.listActiveDepartmentsForWeeklyTeam(env, actor);
  if (!allowed.departmentId) return [];
  const department = await repository.findDepartment(env, actor.companyId, allowed.departmentId);
  return department ? [department] : [];
};

export const getDepartmentWeeklyTeamView = async (
  env: Env,
  actor: AuthActor,
  query: DepartmentWeeklyTeamQuery,
): Promise<DepartmentWeeklyTeamResponse> => {
  await assertDepartmentWeeklyModulesEnabled(env, actor);

  const allowed = await assertCanViewDepartmentWeeklyTeam(env, actor, query);
  if (!allowed.departmentId) throw new ValidationError("Select a department to view the weekly team attendance.");
  const department = await repository.findDepartment(env, actor.companyId, allowed.departmentId);
  if (!department) throw new ValidationError("Select a valid active department.");

  const week = buildWeekDays(query.week_start);
  const leaveEnabled = await featureEnabled(env, actor, "leave");
  const rosterEnabled = await featureEnabled(env, actor, "roster");
  const holidaysEnabled = await featureEnabled(env, actor, "holidays");
  const sourceEmployees = await repository.listDepartmentEmployeesForWeek(env, actor, {
    departmentId: allowed.departmentId,
    outletId: query.outlet_id,
    search: query.search?.trim() || undefined,
    scope: allowed.scope,
    actorEmployee: allowed.actorEmployee,
  });
  const dates = week.map((day) => day.date);
  const employees = await Promise.all(sourceEmployees.map(async (employee) => {
    const cells = await buildEmployeeWeekCells(env, actor, employee, dates, { leave: leaveEnabled, roster: rosterEnabled, holidays: holidaysEnabled });
    return {
      id: employee.id,
      employee_no: employee.employee_code,
      name: employee.full_name,
      department_name: employee.department_name,
      position_name: employee.position_name,
      level: employee.level,
      cells,
    };
  }));
  const filteredEmployees = query.status ? employees
    .map((employee) => ({ ...employee, cells: employee.cells }))
    .filter((employee) => employee.cells.some((cell) => cell.status === query.status)) : employees;
  const weekDays = holidaysEnabled
    ? week.map((day) => ({
      ...day,
      is_holiday: filteredEmployees.some((employee) =>
        employee.cells.some((cell) => cell.date === day.date && (cell.status === "HOLIDAY" || Boolean(cell.holiday))),
      ),
    }))
    : week;

  return {
    week: { start_date: week[0].date, end_date: week[6].date, days: weekDays },
    department,
    summary: getWeeklyTeamSummary(filteredEmployees),
    employees: filteredEmployees,
    warnings: [
      !leaveEnabled ? "Leave module is disabled; leave and sick overlays are unavailable." : null,
      !rosterEnabled ? "Duty Roster module is disabled; shift labels and roster conflict metrics are unavailable." : null,
      !holidaysEnabled ? "Holiday module is disabled; holiday overlays are unavailable." : null,
      filteredEmployees.length === 0 ? "No employees found in this department." : null,
    ].filter((warning): warning is string => Boolean(warning)),
  };
};
