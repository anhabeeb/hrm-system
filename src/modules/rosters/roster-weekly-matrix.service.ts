import { resolveModuleFeatureAliases } from "../../config/module-codes";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { PermissionError, ValidationError } from "../../utils/errors";
import * as rosterService from "./rosters.service";
import * as repository from "./roster-weekly-matrix.repository";
import type {
  RosterMatrixAssignmentChange,
  RosterMatrixAssignmentRecord,
  RosterMatrixAttendanceOverlayRecord,
  RosterMatrixChangePayload,
  RosterMatrixConflict,
  RosterMatrixEmployeeRecord,
  RosterMatrixPendingChangeRecord,
  RosterMatrixStatus,
  RosterWeeklyMatrixQuery,
  RosterWeeklyMatrixResponse,
} from "./roster-weekly-matrix.types";

const dayMs = 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayIso = () => isoDate(new Date());
const parseDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addDays = (value: string, days: number) => isoDate(new Date(parseDate(value).getTime() + days * dayMs));
const mondayOfWeek = (date = todayIso()) => {
  const day = parseDate(date).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
};
const normalized = (value: unknown) => String(value ?? "").toLowerCase();
const normalizeDate = (value: string | null | undefined) => value ? String(value).slice(0, 10) : null;
const dateInRange = (date: string, start?: string | null, end?: string | null) =>
  Boolean(start && end && start <= date && end >= date);
const hasAny = (actor: AuthActor, permissions: string[]) =>
  permissionService.isSuperAdmin(actor) || permissionService.hasAnyPermission(actor, permissions);

const viewPermissions = [
  "rosters.weeklyMatrix.view",
  "rosters.weeklyMatrix.viewTeam",
  "rosters.weeklyMatrix.viewAll",
  "rosters.view",
  "roster.view",
];
const teamPermissions = ["rosters.weeklyMatrix.viewTeam", "roster.view", "rosters.view"];
const editPermissions = ["rosters.weeklyMatrix.edit", "rosters.manage", "roster.create", "roster.edit"];
const submitPermissions = ["rosters.weeklyMatrix.submit", "roster.changes.create", "roster.changes.createForOthers"];
const applyPermissions = ["rosters.weeklyMatrix.apply", "rosters.manage", "roster.publish", "roster.changes.apply"];
const bulkAssignPermissions = ["rosters.weeklyMatrix.bulkAssign", ...editPermissions];
const overridePermissions = ["rosters.weeklyMatrix.overrideConflicts", "rosters.resolve_conflicts", "roster.resolve_conflicts", "rosters.manage"];
const ROSTER_MATRIX_APPROVAL_OPERATION = "ROSTER_CHANGE";
const DRAFT_ONLY_ASSIGN_MESSAGE = "Only new shift assignments can be saved as draft. Submit changes for approval for shift changes, clear shift, or day off.";

const labels: Record<RosterMatrixStatus, string> = {
  SHIFT_ASSIGNED: "Shift",
  DAY_OFF: "Day Off",
  LEAVE: "Leave",
  SICK: "Sick Leave",
  HOLIDAY: "Holiday",
  ABSENT_OVERLAY: "Absent",
  PENDING_CHANGE: "Pending Change",
  APPROVED_CHANGE: "Approved Change",
  CONFLICT: "Conflict",
  DOUBLE_BOOKED: "Double Booked",
  OUTSIDE_EMPLOYMENT: "Outside Employment",
  NOT_ACTIVE: "Not Active",
  EMPTY: "Empty",
};

const featureEnabled = async (env: Env, actor: AuthActor, moduleCode: string) => {
  const results = await Promise.all(resolveModuleFeatureAliases(moduleCode).map((feature) =>
    settingsService.isFeatureEnabled(env, actor.companyId, feature, actor),
  ));
  return results.some(Boolean);
};

export const assertRosterWeeklyMatrixModulesEnabled = async (env: Env, actor: AuthActor) => {
  const [rosterEnabled, employeesEnabled] = await Promise.all([
    featureEnabled(env, actor, "roster"),
    featureEnabled(env, actor, "employees"),
  ]);
  if (!rosterEnabled || !employeesEnabled) throw new PermissionError("This module is currently disabled.");
};

export const buildRosterWeekDays = (weekStart?: string) => {
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

export const resolveAllowedRosterMatrixScope = async (env: Env, actor: AuthActor, requestedDepartmentId?: string | null) => {
  if (!hasAny(actor, viewPermissions)) throw new PermissionError("You do not have permission to view the roster weekly matrix.");
  if (actor.isSuperAdmin || actor.isAdmin || hasAny(actor, ["rosters.weeklyMatrix.viewAll", "rosters.manage"])) {
    return { scope: "all" as const, departmentId: requestedDepartmentId ?? null, actorEmployee: null };
  }
  const actorEmployee = await repository.findActorLinkedEmployee(env, actor);
  if (!actorEmployee?.department_id) throw new PermissionError("Roster weekly matrix team access requires a linked employee department.");
  if (!hasAny(actor, teamPermissions)) throw new PermissionError("You do not have permission to view this roster team.");
  if (requestedDepartmentId && requestedDepartmentId !== actorEmployee.department_id) {
    throw new PermissionError("You do not have permission to view this roster department.");
  }
  return { scope: "team" as const, departmentId: actorEmployee.department_id, actorEmployee };
};

export const assertCanViewRosterMatrix = async (env: Env, actor: AuthActor, query: RosterWeeklyMatrixQuery) => {
  await assertRosterWeeklyMatrixModulesEnabled(env, actor);
  return resolveAllowedRosterMatrixScope(env, actor, query.department_id);
};

export const assertCanEditRosterMatrix = (actor: AuthActor) => {
  if (!hasAny(actor, editPermissions)) throw new PermissionError("You do not have permission to edit roster matrix drafts.");
};

export const assertCanSubmitRosterMatrix = (actor: AuthActor) => {
  if (!hasAny(actor, submitPermissions)) throw new PermissionError("You do not have permission to submit roster matrix changes.");
};

export const assertCanApplyRosterMatrix = (actor: AuthActor) => {
  if (!hasAny(actor, applyPermissions)) throw new PermissionError("You do not have permission to apply roster matrix changes.");
};

export const assertCanOverrideRosterMatrixConflicts = (actor: AuthActor) => {
  if (!hasAny(actor, overridePermissions)) {
    throw new PermissionError("You do not have permission to override roster matrix conflict warnings.");
  }
};

const employeeActiveOnDate = (employee: RosterMatrixEmployeeRecord, date: string) => {
  const joined = normalizeDate(employee.joined_at);
  const resigned = normalizeDate(employee.resigned_at);
  const terminated = normalizeDate(employee.terminated_at);
  if (joined && date < joined) return false;
  if (resigned && date > resigned) return false;
  if (terminated && date > terminated) return false;
  return true;
};

const isActiveEmploymentStatus = (employee: RosterMatrixEmployeeRecord) =>
  !["inactive", "terminated", "resigned", "retired", "archived", "deleted"].includes(normalized(employee.employment_status));

const isSickLeave = (leave: Record<string, any> | null | undefined) =>
  Boolean(leave && /sick/i.test(String(leave.leave_key ?? leave.leave_name ?? "")));

const safeParseJson = (value: string | null | undefined): Record<string, any> => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const byEmployeeDate = <T extends { employee_id?: string | null }>(
  rows: T[],
  dateResolver: (row: T) => string | null,
) => {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const date = dateResolver(row);
    if (!row.employee_id || !date) return;
    const key = `${row.employee_id}:${date}`;
    map.set(key, [...(map.get(key) ?? []), row]);
  });
  return map;
};

const singleByEmployeeDate = <T extends { employee_id?: string | null }>(
  rows: T[],
  dateResolver: (row: T) => string | null,
) => {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const date = dateResolver(row);
    if (!row.employee_id || !date) return;
    map.set(`${row.employee_id}:${date}`, row);
  });
  return map;
};

const rangeRowsForDate = <T extends Record<string, any>>(rows: T[], employeeId: string, date: string) =>
  rows.filter((row) => row.employee_id === employeeId && dateInRange(date, normalizeDate(row.start_date), normalizeDate(row.end_date)));

const dateRowsForDate = <T extends Record<string, any>>(rows: T[], date: string) =>
  rows.filter((row) => dateInRange(date, normalizeDate(row.start_date), normalizeDate(row.end_date)));

const attendanceOverlayFor = (
  overlay: RosterMatrixAttendanceOverlayRecord | undefined,
  input: { hasShift: boolean; date: string },
) => {
  if (!overlay && !(input.hasShift && input.date < todayIso())) return null;
  const status = normalized(overlay?.status);
  const pendingCorrection = Number(overlay?.pending_correction_count ?? 0) > 0;
  const approvedCorrection = Number(overlay?.approved_correction_count ?? 0) > 0;
  const missingPunch = ["missing_clock_in", "missing_clock_out", "missing_check_in", "missing_checkout", "incomplete", "conflict"].includes(status);
  const absent = status === "absent" || (!overlay && input.hasShift && input.date < todayIso());
  const late = Number(overlay?.late_minutes ?? 0) > 0 || status === "late";
  const present = Boolean(overlay?.check_in || overlay?.check_out || ["present", "checked_in", "checked_out"].includes(status));
  const label = pendingCorrection
    ? "Pending attendance correction"
    : approvedCorrection
      ? "Approved attendance correction"
      : missingPunch
        ? "Missing punch"
        : absent
          ? "Scheduled but absent/no attendance"
          : late
            ? "Late attendance"
            : present
              ? "Attendance present"
              : "Attendance review";
  return {
    status: overlay?.status ?? (absent ? "absent" : null),
    label,
    check_in: overlay?.check_in ?? null,
    check_out: overlay?.check_out ?? null,
    late_minutes: overlay?.late_minutes ?? null,
    worked_minutes: overlay?.worked_minutes ?? null,
    pending_correction: pendingCorrection,
    approved_correction: approvedCorrection,
    review_required: pendingCorrection || missingPunch || absent,
  };
};

const ensureOverridePermissionForPayload = (actor: AuthActor, payload: RosterMatrixChangePayload) => {
  const overrideChanges = payload.changes.filter((change) => change.override_conflicts === true);
  if (overrideChanges.length === 0) return;
  assertCanOverrideRosterMatrixConflicts(actor);
  const missingReason = overrideChanges.some((change) => !(change.reason || payload.reason)?.trim());
  if (missingReason) throw new ValidationError("A reason is required when overriding roster conflict warnings.");
};

const auditRosterMatrixOverride = async (
  env: Env,
  actor: AuthActor,
  change: RosterMatrixAssignmentChange,
  action: string,
  conflicts: RosterMatrixConflict[],
  reason?: string | null,
) => {
  if (!change.override_conflicts || conflicts.length === 0) return;
  await createAuditLog(env, {
    companyId: actor.companyId,
    module: "roster",
    action,
    severity: conflicts.some((conflict) => conflict.severity === "error") ? "warning" : "info",
    entityType: "roster_weekly_matrix",
    entityId: change.assignment_id ?? `${change.employee_id}:${change.date}`,
    employeeId: change.employee_id,
    actorId: actor.actorUserId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    reason: reason ?? undefined,
    requestId: actor.requestId,
    details: {
      source: "weekly_matrix",
      override_conflicts: true,
      change,
      conflicts,
    },
  });
};

const validateAndClassifyConflicts = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  await assertCanViewRosterMatrix(env, actor, { department_id: payload.department_id ?? undefined, outlet_id: payload.outlet_id ?? undefined, week_start: payload.week_start });
  if (!payload.changes.length) throw new ValidationError("Add at least one roster matrix change before validating.");
  ensureOverridePermissionForPayload(actor, payload);
  const perChange = await Promise.all(payload.changes.map(async (change) => ({
    change,
    conflicts: await detectRosterConflicts(env, actor, change, { departmentId: payload.department_id, outletId: payload.outlet_id }),
  })));
  return {
    perChange,
    conflicts: perChange.flatMap((item) => item.conflicts),
  };
};

const assertMutationConflictsAllowed = (
  actor: AuthActor,
  payload: RosterMatrixChangePayload,
  perChange: Array<{ change: RosterMatrixAssignmentChange; conflicts: RosterMatrixConflict[] }>,
) => {
  const errors = perChange.flatMap((item) => item.conflicts.filter((conflict) => conflict.severity === "error"));
  if (errors.length > 0) {
    throw new ValidationError("Roster matrix changes have blocking conflicts. Resolve critical conflicts before saving or submitting.");
  }
  const warningChanges = perChange.filter((item) => item.conflicts.some((conflict) => conflict.severity === "warning"));
  if (warningChanges.length === 0) return;
  const allWarningsOverridden = warningChanges.every((item) => item.change.override_conflicts === true && Boolean((item.change.reason || payload.reason)?.trim()));
  if (!allWarningsOverridden) {
    throw new ValidationError("Roster matrix warnings require an approved override reason before saving or submitting.");
  }
  assertCanOverrideRosterMatrixConflicts(actor);
};

export const resolveRosterCellStatus = (input: {
  employee: RosterMatrixEmployeeRecord;
  date: string;
  assignments: RosterMatrixAssignmentRecord[];
  pendingChange: RosterMatrixPendingChangeRecord | null;
  leave: Record<string, any> | null;
  holiday: Record<string, any> | null;
  conflictCount: number;
}): RosterMatrixStatus => {
  if (!employeeActiveOnDate(input.employee, input.date)) return "OUTSIDE_EMPLOYMENT";
  if (!isActiveEmploymentStatus(input.employee)) return "NOT_ACTIVE";
  if (input.assignments.length > 1) return "DOUBLE_BOOKED";
  if (input.conflictCount > 0) return "CONFLICT";
  if (input.pendingChange && input.pendingChange.status === "APPROVED") return "APPROVED_CHANGE";
  if (input.pendingChange) return "PENDING_CHANGE";
  if (input.leave) return isSickLeave(input.leave) ? "SICK" : "LEAVE";
  if (input.holiday) return "HOLIDAY";
  const assignment = input.assignments[0];
  if (!assignment) return "EMPTY";
  if (["day_off", "off", "rest_day"].includes(normalized(assignment.status)) || /day off|rest|off/i.test(String(assignment.shift_name ?? assignment.source ?? ""))) {
    return "DAY_OFF";
  }
  return "SHIFT_ASSIGNED";
};

export const getRosterMatrixEmployees = async (env: Env, actor: AuthActor, query: RosterWeeklyMatrixQuery = {}) => {
  const allowed = await assertCanViewRosterMatrix(env, actor, query);
  return repository.listRosterMatrixEmployeeOptions(env, actor, {
    departmentId: allowed.departmentId,
    outletId: query.outlet_id,
    search: query.search,
    actorEmployee: allowed.actorEmployee,
    scope: allowed.scope,
    limit: 80,
  });
};

export const getRosterMatrixShifts = async (env: Env, actor: AuthActor, query: RosterWeeklyMatrixQuery = {}) => {
  await assertCanViewRosterMatrix(env, actor, query);
  return repository.listRosterMatrixShifts(env, actor, {
    departmentId: query.department_id,
    outletId: query.outlet_id,
  });
};

const permissionsFor = (actor: AuthActor) => ({
  can_edit: hasAny(actor, editPermissions),
  can_submit: hasAny(actor, submitPermissions),
  can_apply: hasAny(actor, applyPermissions),
  can_bulk_assign: hasAny(actor, bulkAssignPermissions),
  can_override_conflicts: hasAny(actor, overridePermissions),
});

export const getRosterWeeklyMatrix = async (
  env: Env,
  actor: AuthActor,
  query: RosterWeeklyMatrixQuery,
): Promise<RosterWeeklyMatrixResponse> => {
  const allowed = await assertCanViewRosterMatrix(env, actor, query);
  const week = buildRosterWeekDays(query.week_start);
  const start = week[0].date;
  const end = week[6].date;
  const [leaveEnabled, holidaysEnabled, attendanceEnabled] = await Promise.all([
    featureEnabled(env, actor, "leave"),
    featureEnabled(env, actor, "holidays"),
    featureEnabled(env, actor, "attendance"),
  ]);
  const [department, employees, shifts] = await Promise.all([
    allowed.departmentId ? repository.findDepartment(env, actor.companyId, allowed.departmentId) : Promise.resolve(null),
    repository.listRosterMatrixEmployees(env, actor, {
      departmentId: allowed.departmentId,
      outletId: query.outlet_id,
      search: query.search,
      actorEmployee: allowed.actorEmployee,
      scope: allowed.scope,
      limit: 100,
    }),
    repository.listRosterMatrixShifts(env, actor, { departmentId: allowed.departmentId, outletId: query.outlet_id }),
  ]);
  const employeeIds = employees.map((employee) => employee.id);
  const [assignments, pendingChanges, leaves, holidays, conflicts, attendanceOverlays] = await Promise.all([
    repository.listRosterMatrixAssignments(env, actor.companyId, employeeIds, start, end),
    repository.listPendingRosterMatrixChanges(env, actor.companyId, employeeIds, start, end),
    leaveEnabled ? repository.listApprovedLeavesForRosterMatrix(env, actor.companyId, employeeIds, start, end) : Promise.resolve([]),
    holidaysEnabled ? repository.listHolidaysForRosterMatrix(env, actor.companyId, query.outlet_id ?? null, start, end) : Promise.resolve([]),
    repository.listOpenRosterMatrixConflicts(env, actor.companyId, employeeIds, start, end),
    attendanceEnabled ? repository.listAttendanceOverlaysForRosterMatrix(env, actor.companyId, employeeIds, start, end) : Promise.resolve([]),
  ]);
  const assignmentMap = byEmployeeDate(assignments, (row) => row.roster_date);
  const pendingMap = byEmployeeDate(pendingChanges, (row) => normalizeDate(row.requested_date));
  const attendanceMap = singleByEmployeeDate(attendanceOverlays, (row) => row.attendance_date);
  const conflictMap = new Map<string, number>();
  conflicts.forEach((conflict) => {
    if (!conflict.employee_id) return;
    const assignment = assignments.find((row) => row.id === conflict.roster_shift_id);
    const date = assignment?.roster_date ?? start;
    const key = `${conflict.employee_id}:${date}`;
    conflictMap.set(key, (conflictMap.get(key) ?? 0) + 1);
  });

  const rows = employees.map((employee) => {
    const cells = week.map((day) => {
      const key = `${employee.id}:${day.date}`;
      const dayAssignments = assignmentMap.get(key) ?? [];
      const pendingChange = pendingMap.get(key)?.[0] ?? null;
      const leave = rangeRowsForDate(leaves, employee.id, day.date)[0] ?? null;
      const holiday = dateRowsForDate(holidays, day.date)[0] ?? null;
      const conflictCount = conflictMap.get(key) ?? dayAssignments.reduce((sum, assignment) => sum + Number(assignment.open_conflict_count ?? 0), 0);
      const status = resolveRosterCellStatus({ employee, date: day.date, assignments: dayAssignments, pendingChange, leave, holiday, conflictCount });
      const assignment = dayAssignments[0] ?? null;
      const attendanceOverlay = attendanceEnabled
        ? attendanceOverlayFor(attendanceMap.get(key), { hasShift: Boolean(assignment), date: day.date })
        : null;
      const warnings = [
        status === "LEAVE" || status === "SICK" ? "Employee has approved leave on this day." : null,
        status === "HOLIDAY" ? "Holiday overlay is active for this date." : null,
        status === "PENDING_CHANGE" ? "Roster change is pending approval." : null,
        status === "DOUBLE_BOOKED" ? "Employee has more than one active shift on this day." : null,
        status === "CONFLICT" ? "Open roster conflict requires review." : null,
        attendanceOverlay?.review_required ? attendanceOverlay.label : null,
      ].filter((warning): warning is string => Boolean(warning));
      const errors = [
        status === "DOUBLE_BOOKED" ? "Double-booked shift must be resolved before publish." : null,
        status === "NOT_ACTIVE" || status === "OUTSIDE_EMPLOYMENT" ? "Employee cannot be assigned on this date." : null,
      ].filter((error): error is string => Boolean(error));

      return {
        date: day.date,
        status,
        label: labels[status],
        assignment_id: assignment?.id ?? null,
        shift: assignment ? {
          id: assignment.shift_template_id,
          name: assignment.shift_name ?? assignment.shift_code ?? "Assigned shift",
          start_time: assignment.start_time,
          end_time: assignment.end_time,
        } : null,
        is_draft: assignment?.status === "draft",
        is_published: assignment?.status === "published" || Boolean(assignment?.published_at),
        is_locked: false,
        leave: leave ? { id: String(leave.id), leave_type: leave.leave_name ?? leave.leave_key ?? null, status: String(leave.status ?? "approved") } : null,
        holiday: holiday ? { id: String(holiday.id), name: holiday.holiday_name ?? null } : null,
        attendance_overlay: attendanceOverlay,
        pending_change: pendingChange ? { id: pendingChange.id, status: pendingChange.status, change_type: pendingChange.change_type } : null,
        warnings,
        errors,
      };
    });
    return {
      id: employee.id,
      employee_no: employee.employee_code,
      name: employee.full_name,
      department_name: employee.department_name,
      position_name: employee.position_name,
      level: employee.level,
      contracted_work_type: null,
      cells,
    };
  });
  const filteredRows = query.status ? rows.filter((row) => row.cells.some((cell) => cell.status === query.status)) : rows;
  const allCells = filteredRows.flatMap((row) => row.cells);
  const weekDays = holidaysEnabled
    ? week.map((day) => ({ ...day, is_holiday: allCells.some((cell) => cell.date === day.date && Boolean(cell.holiday)) }))
    : week;

  return {
    week: { start_date: start, end_date: end, days: weekDays },
    scope: {
      department_id: allowed.departmentId,
      department_name: department?.name ?? null,
      outlet_id: query.outlet_id ?? null,
      outlet_name: null,
    },
    summary: {
      total_employees: filteredRows.length,
      assigned_shifts: allCells.filter((cell) => cell.status === "SHIFT_ASSIGNED").length,
      open_cells: allCells.filter((cell) => cell.status === "EMPTY").length,
      day_off_cells: allCells.filter((cell) => cell.status === "DAY_OFF").length,
      leave_conflicts: allCells.filter((cell) => ["LEAVE", "SICK"].includes(cell.status) && Boolean(cell.shift)).length,
      double_bookings: allCells.filter((cell) => cell.status === "DOUBLE_BOOKED").length,
      pending_changes: allCells.filter((cell) => cell.pending_change).length,
      published_assignments: allCells.filter((cell) => cell.is_published).length,
      draft_assignments: allCells.filter((cell) => cell.is_draft).length,
    },
    shifts,
    employees: filteredRows,
    permissions: permissionsFor(actor),
    warnings: [
      !leaveEnabled ? "Leave module is disabled; leave and sick overlays are unavailable." : null,
      !attendanceEnabled ? "Attendance module is disabled; attendance overlays are unavailable." : null,
      !holidaysEnabled ? "Holiday module is disabled; holiday overlays are unavailable." : null,
      filteredRows.length === 0 ? "No employees found for this roster scope." : null,
      shifts.length === 0 ? "No shifts are configured for this department/outlet." : null,
    ].filter((warning): warning is string => Boolean(warning)),
  };
};

const findEmployeeInScope = async (env: Env, actor: AuthActor, change: RosterMatrixAssignmentChange, departmentId?: string | null, outletId?: string | null) => {
  const allowed = await resolveAllowedRosterMatrixScope(env, actor, departmentId);
  const employees = await repository.listRosterMatrixEmployees(env, actor, {
    departmentId: allowed.departmentId,
    outletId,
    actorEmployee: allowed.actorEmployee,
    scope: allowed.scope,
    limit: 200,
  });
  return employees.find((employee) => employee.id === change.employee_id) ?? null;
};

export const detectRosterConflicts = async (
  env: Env,
  actor: AuthActor,
  change: RosterMatrixAssignmentChange,
  options: { departmentId?: string | null; outletId?: string | null } = {},
): Promise<RosterMatrixConflict[]> => {
  const conflicts: RosterMatrixConflict[] = [];
  const employee = await findEmployeeInScope(env, actor, change, options.departmentId, options.outletId);
  if (!employee) {
    conflicts.push({ code: "EMPLOYEE_OUT_OF_SCOPE", severity: "error", message: "Employee is not available in your roster scope.", employee_id: change.employee_id, date: change.date });
    return conflicts;
  }
  if (!employeeActiveOnDate(employee, change.date) || !isActiveEmploymentStatus(employee)) {
    conflicts.push({ code: "EMPLOYEE_NOT_ACTIVE", severity: "error", message: "Inactive or offboarded employees cannot be assigned roster shifts.", employee_id: change.employee_id, date: change.date });
  }
  if (change.action === "ASSIGN_SHIFT" || change.action === "CHANGE_SHIFT") {
    if (!change.shift_template_id) {
      conflicts.push({ code: "SHIFT_REQUIRED", severity: "error", message: "Select a shift before assigning roster time.", employee_id: change.employee_id, date: change.date });
    }
    const [assignments, leaves, holidays] = await Promise.all([
      repository.listRosterMatrixAssignments(env, actor.companyId, [change.employee_id], change.date, change.date),
      repository.listApprovedLeavesForRosterMatrix(env, actor.companyId, [change.employee_id], change.date, change.date),
      repository.listHolidaysForRosterMatrix(env, actor.companyId, options.outletId ?? employee.primary_outlet_id, change.date, change.date),
    ]);
    const existing = assignments.filter((assignment) => !change.assignment_id || assignment.id !== change.assignment_id);
    if (existing.length > 0) {
      conflicts.push({ code: "DOUBLE_BOOKED", severity: "error", message: "Employee already has an active roster shift on this date.", employee_id: change.employee_id, date: change.date, assignment_id: existing[0].id });
    }
    if (leaves.length > 0) {
      conflicts.push({ code: "EMPLOYEE_ON_LEAVE", severity: "error", message: "Employee has approved leave or sick leave on this date.", employee_id: change.employee_id, date: change.date });
    }
    if (holidays.length > 0) {
      conflicts.push({ code: "HOLIDAY_WARNING", severity: "warning", message: "This date is a holiday. Review policy before assigning a shift.", employee_id: change.employee_id, date: change.date });
    }
  }
  return conflicts;
};

export const validateRosterMatrixChanges = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  const { conflicts } = await validateAndClassifyConflicts(env, actor, payload);
  return {
    valid: conflicts.every((conflict) => conflict.severity !== "error"),
    errors: conflicts.filter((conflict) => conflict.severity === "error"),
    warnings: conflicts.filter((conflict) => conflict.severity === "warning"),
    conflict_summary: {
      error_count: conflicts.filter((conflict) => conflict.severity === "error").length,
      warning_count: conflicts.filter((conflict) => conflict.severity === "warning").length,
    },
  };
};

const changeTypeFor = (change: RosterMatrixAssignmentChange) => {
  if (change.action === "CLEAR_SHIFT") return "SHIFT_DELETE" as const;
  if (change.action === "MARK_DAY_OFF") return "DAY_OFF_CHANGE" as const;
  if (change.action === "CHANGE_SHIFT") return "SHIFT_UPDATE" as const;
  return "SHIFT_CREATE" as const;
};

export const submitRosterMatrixChanges = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  assertCanSubmitRosterMatrix(actor);
  const classified = await validateAndClassifyConflicts(env, actor, payload);
  assertMutationConflictsAllowed(actor, payload, classified.perChange);
  const validation = {
    valid: classified.conflicts.every((conflict) => conflict.severity !== "error"),
    errors: classified.conflicts.filter((conflict) => conflict.severity === "error"),
    warnings: classified.conflicts.filter((conflict) => conflict.severity === "warning"),
    conflict_summary: {
      error_count: classified.conflicts.filter((conflict) => conflict.severity === "error").length,
      warning_count: classified.conflicts.filter((conflict) => conflict.severity === "warning").length,
    },
  };
  const submitted: unknown[] = [];
  for (const change of payload.changes) {
    const changeConflicts = classified.perChange.find((item) => item.change === change)?.conflicts ?? [];
    const employee = await findEmployeeInScope(env, actor, change, payload.department_id, payload.outlet_id);
    if (!employee) throw new PermissionError("Employee is not available in your roster scope.");
    const shift = change.shift_template_id
      ? (await repository.listRosterMatrixShifts(env, actor, { departmentId: payload.department_id, outletId: payload.outlet_id })).find((item) => item.id === change.shift_template_id)
      : null;
    const created = await rosterService.createRosterChangeRequest(env, actor, {
      employee_id: change.employee_id,
      shift_id: change.assignment_id ?? null,
      change_type: changeTypeFor(change),
      requested_date: change.date,
      requested_start_at: shift?.start_time ?? null,
      requested_end_at: shift?.end_time ?? null,
      requested_value_json: {
        source: "weekly_matrix",
        action: change.action,
        shift_template_id: change.shift_template_id ?? null,
        roster_date: change.date,
        outlet_id: payload.outlet_id ?? employee.primary_outlet_id,
        department_id: payload.department_id ?? employee.department_id,
        notes: change.note ?? null,
        override_warnings: change.override_conflicts === true,
      },
      reason: change.reason || payload.reason || "Roster weekly matrix change submitted for approval.",
      manager_note: change.note ?? null,
      override_warnings: change.override_conflicts,
    });
    const submittedChange = await rosterService.submitRosterChangeForApproval(env, actor, created.roster_change.id);
    await auditRosterMatrixOverride(env, actor, change, "ROSTER_MATRIX_CONFLICT_OVERRIDE_SUBMITTED", changeConflicts, change.reason || payload.reason);
    submitted.push(submittedChange);
  }
  return { operation_type: ROSTER_MATRIX_APPROVAL_OPERATION, submitted_count: submitted.length, roster_change_requests: submitted, validation };
};

export const saveRosterMatrixDraft = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  assertCanEditRosterMatrix(actor);
  const unsupportedDraftActions = payload.changes.filter((change) => change.action !== "ASSIGN_SHIFT");
  if (unsupportedDraftActions.length > 0) {
    throw new ValidationError(DRAFT_ONLY_ASSIGN_MESSAGE);
  }
  const classified = await validateAndClassifyConflicts(env, actor, payload);
  assertMutationConflictsAllowed(actor, payload, classified.perChange);
  const validation = {
    valid: classified.conflicts.every((conflict) => conflict.severity !== "error"),
    errors: classified.conflicts.filter((conflict) => conflict.severity === "error"),
    warnings: classified.conflicts.filter((conflict) => conflict.severity === "warning"),
    conflict_summary: {
      error_count: classified.conflicts.filter((conflict) => conflict.severity === "error").length,
      warning_count: classified.conflicts.filter((conflict) => conflict.severity === "warning").length,
    },
  };
  const created: unknown[] = [];
  for (const change of payload.changes) {
    if (!change.shift_template_id) throw new ValidationError("Select a shift before saving a roster draft.");
    const changeConflicts = classified.perChange.find((item) => item.change === change)?.conflicts ?? [];
    const employee = await findEmployeeInScope(env, actor, change, payload.department_id, payload.outlet_id);
    if (!employee) throw new PermissionError("Employee is not available in your roster scope.");
    const shift = (await repository.listRosterMatrixShifts(env, actor, { departmentId: payload.department_id, outletId: payload.outlet_id })).find((item) => item.id === change.shift_template_id);
    if (!shift) throw new ValidationError("Select an available shift for this roster scope.");
    created.push(await rosterService.createRosterShift(env, actor, {
      outlet_id: payload.outlet_id ?? employee.primary_outlet_id ?? "",
      department_id: payload.department_id ?? employee.department_id,
      position_id: employee.position_id,
      employee_id: employee.id,
      shift_template_id: shift.id,
      roster_date: change.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes,
      notes: change.note ?? "Created from weekly matrix draft.",
      reason: change.reason ?? payload.reason ?? "Weekly matrix draft.",
      override_warnings: change.override_conflicts,
    }));
    await auditRosterMatrixOverride(env, actor, change, "ROSTER_MATRIX_CONFLICT_OVERRIDE_DRAFT_SAVED", changeConflicts, change.reason || payload.reason);
  }
  return { saved_count: created.length, roster_shifts: created, validation };
};

export const applyRosterMatrixChanges = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  assertCanApplyRosterMatrix(actor);
  const classified = await validateAndClassifyConflicts(env, actor, payload);
  assertMutationConflictsAllowed(actor, payload, classified.perChange);
  const validation = {
    valid: classified.conflicts.every((conflict) => conflict.severity !== "error"),
    errors: classified.conflicts.filter((conflict) => conflict.severity === "error"),
    warnings: classified.conflicts.filter((conflict) => conflict.severity === "warning"),
    conflict_summary: {
      error_count: classified.conflicts.filter((conflict) => conflict.severity === "error").length,
      warning_count: classified.conflicts.filter((conflict) => conflict.severity === "warning").length,
    },
  };
  await Promise.all(classified.perChange.map((item) =>
    auditRosterMatrixOverride(env, actor, item.change, "ROSTER_MATRIX_CONFLICT_OVERRIDE_APPLY_HELD", item.conflicts, item.change.reason || payload.reason),
  ));
  return {
    applied: false,
    manual_review_required: true,
    message: "Direct matrix apply is held for roster change approval/application workflow. Submit changes for approval or apply an approved roster change request.",
    validation,
  };
};

export const copyPreviousWeekRoster = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  await assertCanViewRosterMatrix(env, actor, { department_id: payload.department_id ?? undefined, outlet_id: payload.outlet_id ?? undefined, week_start: payload.week_start });
  if (!hasAny(actor, ["rosters.weeklyMatrix.copyWeek", ...editPermissions])) {
    throw new PermissionError("You do not have permission to copy roster weeks.");
  }
  const week = buildRosterWeekDays(payload.week_start);
  const previousStart = addDays(week[0].date, -7);
  const previousEnd = addDays(week[6].date, -7);
  const employees = await getRosterMatrixEmployees(env, actor, { department_id: payload.department_id ?? undefined, outlet_id: payload.outlet_id ?? undefined });
  const assignments = await repository.listRosterMatrixAssignments(env, actor.companyId, employees.map((employee) => employee.id), previousStart, previousEnd);
  const proposed_changes: RosterMatrixAssignmentChange[] = assignments.map((assignment) => ({
    employee_id: assignment.employee_id,
    date: addDays(assignment.roster_date, 7),
    action: "ASSIGN_SHIFT",
    shift_template_id: assignment.shift_template_id,
    reason: payload.reason ?? "Copy previous week roster.",
  }));
  return { proposed_changes, previous_week: { start_date: previousStart, end_date: previousEnd } };
};

export const bulkAssignRosterMatrix = async (env: Env, actor: AuthActor, payload: RosterMatrixChangePayload) => {
  if (!hasAny(actor, bulkAssignPermissions)) {
    throw new PermissionError("You do not have permission to bulk assign roster shifts.");
  }
  const classified = await validateAndClassifyConflicts(env, actor, payload);
  assertMutationConflictsAllowed(actor, payload, classified.perChange);
  await Promise.all(classified.perChange.map((item) =>
    auditRosterMatrixOverride(env, actor, item.change, "ROSTER_MATRIX_CONFLICT_OVERRIDE_BULK_VALIDATED", item.conflicts, item.change.reason || payload.reason),
  ));
  return {
    valid: classified.conflicts.every((conflict) => conflict.severity !== "error"),
    errors: classified.conflicts.filter((conflict) => conflict.severity === "error"),
    warnings: classified.conflicts.filter((conflict) => conflict.severity === "warning"),
    conflict_summary: {
      error_count: classified.conflicts.filter((conflict) => conflict.severity === "error").length,
      warning_count: classified.conflicts.filter((conflict) => conflict.severity === "warning").length,
    },
  };
};
