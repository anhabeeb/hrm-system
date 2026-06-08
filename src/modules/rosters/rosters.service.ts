import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { createAuditLog } from "../../services/audit.service";
import { assertPayrollMonthUnlocked, getPayrollMonthFromDate } from "../payroll/payroll-lock.service";
import * as holidayCalculation from "../holidays/holiday-calculation.service";
import * as holidayService from "../holidays/holidays.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, LockedRecordError, NotFoundError, OutletAccessError, PermissionError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import {
  APPROVED_LEAVE_STATUSES,
  DEFAULT_ROSTER_SETTINGS,
  LEAVING_STATUSES,
} from "./rosters.constants";
import * as repository from "./rosters.repository";
import type {
  RosterActionInput,
  RosterBulkInput,
  RosterConflictFilters,
  RosterEmployeeRecord,
  RosterListFilters,
  RosterPublishInput,
  RosterSettings,
  RosterShiftInput,
  RosterShiftRecord,
  RosterShiftUpdateInput,
  ShiftTemplateFilters,
  ShiftTemplateInput,
  ShiftTemplateRecord,
  ShiftTemplateUpdateInput,
} from "./rosters.types";

interface DetectedConflict {
  conflictType: string;
  severity: "warning" | "error";
  message: string;
}

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const pagination = (filters: { page: number; page_size: number }, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.max(1, Math.ceil(total / filters.page_size)),
});

const hasRosterPermission = (context: AuthActor, permission: string) =>
  context.isSuperAdmin ||
  permissionService.hasPermission(context, permission) ||
  permissionService.hasPermission(context, permission.replace("rosters.", "roster.")) ||
  permissionService.hasPermission(context, permission.replace("shift_templates.", "roster."));

const assertViewRoster = (context: AuthActor) => {
  if (hasRosterPermission(context, "rosters.view") || hasRosterPermission(context, "roster.view")) return;
  throw new PermissionError("You do not have permission to view rosters.", "ROSTER_PERMISSION_DENIED");
};

const assertManageRoster = (context: AuthActor) => {
  if (hasRosterPermission(context, "rosters.manage") || hasRosterPermission(context, "roster.create") || hasRosterPermission(context, "roster.edit")) return;
  throw new PermissionError("You do not have permission to manage rosters.", "ROSTER_PERMISSION_DENIED");
};

const assertPublishRoster = (context: AuthActor) => {
  if (hasRosterPermission(context, "rosters.publish") || hasRosterPermission(context, "roster.publish")) return;
  throw new PermissionError("You do not have permission to publish rosters.", "ROSTER_PERMISSION_DENIED");
};

const assertResolveRosterConflict = (context: AuthActor) => {
  if (
    hasRosterPermission(context, "roster.resolve_conflicts") ||
    hasRosterPermission(context, "rosters.resolve_conflicts") ||
    hasRosterPermission(context, "rosters.manage")
  ) return;
  throw new PermissionError("You do not have permission to resolve roster conflicts.", "ROSTER_PERMISSION_DENIED");
};

const assertViewTemplates = (context: AuthActor) => {
  if (hasRosterPermission(context, "shift_templates.view") || hasRosterPermission(context, "roster.view")) return;
  throw new PermissionError("You do not have permission to view shift templates.", "SHIFT_TEMPLATE_PERMISSION_DENIED");
};

const assertManageTemplates = (context: AuthActor) => {
  if (hasRosterPermission(context, "shift_templates.manage") || hasRosterPermission(context, "roster.edit")) return;
  throw new PermissionError("You do not have permission to manage shift templates.", "SHIFT_TEMPLATE_PERMISSION_DENIED");
};

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!context.isSuperAdmin && !permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError();
  }
};

const assertEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string): Promise<RosterEmployeeRecord> => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) {
    throw new NotFoundError("The requested employee could not be found.");
  }
  assertOutletAccess(context, employee.primary_outlet_id);
  return employee;
};

const getRosterSettings = async (env: Env, companyId: string): Promise<RosterSettings> => {
  const row = await settingsService.getSetting(env, companyId, "attendance.roster_rules").catch(() => null);
  const parsed = parseJson<Partial<RosterSettings>>(row?.setting_value_json, {});
  const defaultBreak = Number(parsed.default_shift_break_minutes);
  const warningDays = Number(parsed.roster_conflict_warning_days);
  return {
    ...DEFAULT_ROSTER_SETTINGS,
    ...parsed,
    default_shift_break_minutes: Number.isInteger(defaultBreak) && defaultBreak >= 0 ? defaultBreak : DEFAULT_ROSTER_SETTINGS.default_shift_break_minutes,
    roster_conflict_warning_days: Number.isInteger(warningDays) && warningDays > 0 ? warningDays : DEFAULT_ROSTER_SETTINGS.roster_conflict_warning_days,
  };
};

const autoCrossesMidnight = (startTime: string, endTime: string) => endTime <= startTime;

const withTemplateDefaults = async (
  env: Env,
  companyId: string,
  payload: RosterShiftInput | RosterShiftUpdateInput,
  previous?: RosterShiftRecord,
) => {
  const templateId = payload.shift_template_id ?? previous?.shift_template_id ?? null;
  const template = templateId ? await repository.findShiftTemplate(env, companyId, templateId) : null;
  if (templateId && (!template || template.status !== "active" || template.active !== 1)) {
    throw new AppError({
      code: "SHIFT_TEMPLATE_NOT_AVAILABLE",
      message: "This shift template is not available.",
      statusCode: 400,
      retryable: false,
    });
  }
  const start_time = payload.start_time ?? template?.start_time ?? previous?.start_time;
  const end_time = payload.end_time ?? template?.end_time ?? previous?.end_time;
  if (!start_time || !end_time) {
    throw new AppError({
      code: "SHIFT_TIME_REQUIRED",
      message: "Start time and end time are required.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { start_time: "Choose a shift template or enter start time.", end_time: "Choose a shift template or enter end time." },
    });
  }
  return {
    shift_template_id: templateId,
    start_time,
    end_time,
    break_minutes: payload.break_minutes ?? template?.break_minutes ?? previous?.break_minutes ?? 0,
  };
};

const audit = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    employeeId?: string;
    outletId?: string | null;
    reason?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "rosters",
    action: input.action,
    severity: input.action.includes("CANCELLED") || input.action.includes("CONFLICT") ? "warning" : "info",
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    reason: input.reason ?? undefined,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Roster audit log could not be recorded", {
      action: input.action,
      entityId: input.entityId,
      requestId: context.requestId,
      error,
    });
  });
};

const payrollLockConflict = async (env: Env, companyId: string, date: string): Promise<DetectedConflict | null> => {
  try {
    await assertPayrollMonthUnlocked(env, companyId, getPayrollMonthFromDate(date));
    return null;
  } catch (error) {
    if (error instanceof LockedRecordError) {
      return {
        conflictType: "payroll_locked_period",
        severity: "error",
        message: "This roster date is inside a finalized payroll period.",
      };
    }
    throw error;
  }
};

const detectConflicts = async (
  env: Env,
  context: AuthActor,
  input: {
    employee: RosterEmployeeRecord;
    outletId: string;
    departmentId?: string | null;
    rosterDate: string;
    startTime: string;
    endTime: string;
    excludeRosterShiftId?: string;
  },
  settings: RosterSettings,
): Promise<DetectedConflict[]> => {
  const conflicts: DetectedConflict[] = [];
  const locked = await payrollLockConflict(env, context.companyId, input.rosterDate);
  if (locked) conflicts.push(locked);

  if (input.employee.primary_outlet_id && input.employee.primary_outlet_id !== input.outletId && !context.isSuperAdmin) {
    conflicts.push({
      conflictType: "employee_inactive",
      severity: "error",
      message: "This employee is not assigned to the selected outlet.",
    });
  }

  if (input.employee.joined_at && input.rosterDate < input.employee.joined_at) {
    conflicts.push({
      conflictType: "employee_inactive",
      severity: "error",
      message: "This employee cannot be scheduled before their joining date.",
    });
  }

  if ((input.employee.terminated_at && input.rosterDate > input.employee.terminated_at) || (input.employee.resigned_at && input.rosterDate > input.employee.resigned_at)) {
    conflicts.push({
      conflictType: "employee_terminated",
      severity: "error",
      message: "Terminated or resigned employees cannot be scheduled after their exit date.",
    });
  }

  if ((LEAVING_STATUSES as readonly string[]).includes(input.employee.employment_status)) {
    conflicts.push({
      conflictType: "employee_terminated",
      severity: "error",
      message: "Inactive, resigned, retired, or terminated employees cannot be scheduled.",
    });
  }

  if (input.employee.employment_status === "suspended" && !settings.allow_scheduling_suspended_employee) {
    conflicts.push({
      conflictType: "employee_suspended",
      severity: "error",
      message: "Suspended employees cannot be scheduled unless roster settings allow it.",
    });
  }

  const overlap = await repository.findOverlappingShift(
    env,
    context.companyId,
    input.employee.id,
    input.rosterDate,
    input.startTime,
    input.endTime,
    input.excludeRosterShiftId,
  );
  const overlapMessage = autoCrossesMidnight(input.startTime, input.endTime) || overlap?.crosses_midnight
    ? "This employee already has an overlapping shift across midnight."
    : "This employee already has an overlapping shift.";
  if (overlap && !settings.allow_roster_overlap_override) {
    conflicts.push({
      conflictType: "overlapping_shift",
      severity: "error",
      message: overlapMessage,
    });
  } else if (overlap) {
    conflicts.push({
      conflictType: "overlapping_shift",
      severity: "warning",
      message: overlapMessage,
    });
  }

  const leave = await repository.hasApprovedLeaveOnDate(env, context.companyId, input.employee.id, input.rosterDate, APPROVED_LEAVE_STATUSES);
  if (leave && !settings.allow_scheduling_on_leave) {
    conflicts.push({
      conflictType: "employee_on_leave",
      severity: "error",
      message: "This employee has approved leave on the roster date.",
    });
  } else if (leave) {
    conflicts.push({
      conflictType: "employee_on_leave",
      severity: "warning",
      message: "This employee has approved leave on the roster date.",
    });
  }

  const holidaySettings = await holidayService.getHolidaySettings(env, context.companyId).catch(() => null);
  if (holidaySettings?.holiday_module_enabled === 1 && holidaySettings.holiday_roster_rules_enabled === 1) {
    const holidayEvents = await holidayCalculation.getHolidaysForRange(env, context.companyId, input.rosterDate, input.rosterDate, {
      employeeType: (input.employee as any).employee_type,
      outletId: input.outletId,
      department_id: input.employee.department_id ?? input.departmentId ?? undefined,
      settings: holidaySettings,
    }).catch(() => []);
    const rosterHoliday = holidayEvents.find((event) => event.affects_roster !== 0);
    if (rosterHoliday && !settings.allow_scheduling_on_holidays) {
      conflicts.push({
        conflictType: "holiday_roster_blocked",
        severity: "error",
        message: `This date is blocked by a roster-affecting holiday: ${rosterHoliday.display_name}.`,
      });
    } else if (rosterHoliday) {
      conflicts.push({
        conflictType: "holiday_roster_warning",
        severity: "warning",
        message: `This date is marked as a roster-affecting holiday: ${rosterHoliday.display_name}.`,
      });
    }
  }

  const hasContracts = await repository.hasContractRecords(env, context.companyId, input.employee.id);
  if (hasContracts) {
    const activeContract = await repository.hasActiveContractOnDate(env, context.companyId, input.employee.id, input.rosterDate);
    if (!activeContract) {
      conflicts.push({
        conflictType: "outside_contract",
        severity: "warning",
        message: "This shift is outside the employee's recorded contract period.",
      });
    }
  }

  return conflicts;
};

const assertNoBlockingConflicts = (conflicts: DetectedConflict[], overrideWarnings?: boolean) => {
  const blocking = conflicts.find((conflict) => conflict.severity === "error");
  if (blocking) {
    throw new AppError({
      code: "ROSTER_CONFLICT",
      message: blocking.message,
      statusCode: 409,
      retryable: false,
      details: conflicts,
    });
  }
  if (conflicts.length > 0 && !overrideWarnings) {
    throw new AppError({
      code: "ROSTER_WARNING_REVIEW_REQUIRED",
      message: "Roster warnings need review before this shift can be saved.",
      statusCode: 409,
      retryable: false,
      details: {
        overridable: true,
        conflicts,
      },
    });
  }
};

const conflictRows = (
  context: AuthActor,
  rosterShiftId: string,
  employeeId: string,
  outletId: string,
  departmentId: string | null | undefined,
  conflicts: DetectedConflict[],
) =>
  conflicts.map((conflict) => ({
    id: createPrefixedId("roster_conflict"),
    companyId: context.companyId,
    rosterShiftId,
    employeeId,
    outletId,
    departmentId,
    conflictType: conflict.conflictType,
    severity: conflict.severity,
    message: conflict.message,
  }));

export const listShiftTemplates = async (env: Env, context: AuthActor, filters: ShiftTemplateFilters) => {
  assertViewTemplates(context);
  if (filters.outlet_id) assertOutletAccess(context, filters.outlet_id);
  const result = await repository.listShiftTemplates(env, context.companyId, filters, context.outletIds, context.isSuperAdmin);
  return { rows: result.rows, pagination: pagination(filters, result.total) };
};

export const createShiftTemplate = async (env: Env, context: AuthActor, payload: ShiftTemplateInput) => {
  assertManageTemplates(context);
  assertOutletAccess(context, payload.outlet_id);
  if (payload.code) {
    const duplicate = await repository.findShiftTemplateByCode(env, context.companyId, payload.code);
    if (duplicate) {
      throw new AppError({
        code: "DUPLICATE_SHIFT_TEMPLATE_CODE",
        message: "A shift template with this code already exists.",
        statusCode: 409,
        retryable: false,
      });
    }
  }
  const id = createPrefixedId("shift_template");
  const normalized = {
    ...payload,
    break_minutes: payload.break_minutes ?? DEFAULT_ROSTER_SETTINGS.default_shift_break_minutes,
    crosses_midnight: payload.crosses_midnight ?? autoCrossesMidnight(payload.start_time, payload.end_time),
  };
  await repository.createShiftTemplate(env, { id, companyId: context.companyId, actorUserId: context.actorUserId, payload: normalized });
  const template = await repository.findShiftTemplate(env, context.companyId, id);
  await audit(env, context, { action: "SHIFT_TEMPLATE_CREATED", entityType: "shift_template", entityId: id, outletId: payload.outlet_id, newValue: template });
  return { shift_template: template };
};

export const getShiftTemplate = async (env: Env, context: AuthActor, id: string) => {
  assertViewTemplates(context);
  const template = await repository.findShiftTemplate(env, context.companyId, id);
  if (!template) throw new NotFoundError("The requested shift template could not be found.");
  assertOutletAccess(context, template.outlet_id);
  return { shift_template: template };
};

export const updateShiftTemplate = async (env: Env, context: AuthActor, id: string, payload: ShiftTemplateUpdateInput) => {
  assertManageTemplates(context);
  const existing = await repository.findShiftTemplate(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested shift template could not be found.");
  assertOutletAccess(context, existing.outlet_id);
  assertOutletAccess(context, payload.outlet_id);
  if (payload.code) {
    const duplicate = await repository.findShiftTemplateByCode(env, context.companyId, payload.code, id);
    if (duplicate) throw new ConflictError("A shift template with this code already exists.");
  }
  const normalized = {
    ...payload,
    crosses_midnight: payload.crosses_midnight ?? (
      payload.start_time || payload.end_time
        ? autoCrossesMidnight(payload.start_time ?? existing.start_time, payload.end_time ?? existing.end_time)
        : undefined
    ),
  };
  await repository.updateShiftTemplate(env, context.companyId, id, normalized, context.actorUserId);
  const template = await repository.findShiftTemplate(env, context.companyId, id);
  await audit(env, context, { action: "SHIFT_TEMPLATE_UPDATED", entityType: "shift_template", entityId: id, outletId: template?.outlet_id, oldValue: existing, newValue: template, reason: payload.reason });
  return { shift_template: template };
};

export const setShiftTemplateEnabled = async (env: Env, context: AuthActor, id: string, active: boolean, input: RosterActionInput) => {
  assertManageTemplates(context);
  const existing = await repository.findShiftTemplate(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested shift template could not be found.");
  assertOutletAccess(context, existing.outlet_id);
  await repository.setShiftTemplateStatus(env, context.companyId, id, active, context.actorUserId);
  const template = await repository.findShiftTemplate(env, context.companyId, id);
  await audit(env, context, { action: active ? "SHIFT_TEMPLATE_UPDATED" : "SHIFT_TEMPLATE_DISABLED", entityType: "shift_template", entityId: id, outletId: existing.outlet_id, oldValue: existing, newValue: template, reason: input.reason });
  return { shift_template: template };
};

export const listRosterShifts = async (env: Env, context: AuthActor, filters: RosterListFilters) => {
  assertViewRoster(context);
  if (filters.outlet_id) assertOutletAccess(context, filters.outlet_id);
  const result = await repository.listRosterShifts(env, context.companyId, filters, context.outletIds, context.isSuperAdmin);
  return { rows: result.rows, pagination: pagination(filters, result.total) };
};

export const getRosterShift = async (env: Env, context: AuthActor, id: string) => {
  assertViewRoster(context);
  const shift = await repository.findRosterShift(env, context.companyId, id);
  if (!shift) throw new NotFoundError("The requested roster shift could not be found.");
  assertOutletAccess(context, shift.outlet_id);
  return { roster_shift: shift };
};

export const createRosterShift = async (env: Env, context: AuthActor, payload: RosterShiftInput) => {
  assertManageRoster(context);
  assertOutletAccess(context, payload.outlet_id);
  const employee = await assertEmployeeAccess(env, context, payload.employee_id);
  const settings = await getRosterSettings(env, context.companyId);
  const shiftDefaults = await withTemplateDefaults(env, context.companyId, payload);
  const departmentId = payload.department_id ?? employee.department_id ?? null;
  const positionId = payload.position_id ?? employee.position_id ?? null;
  const conflicts = await detectConflicts(env, context, {
    employee,
    outletId: payload.outlet_id,
    departmentId,
    rosterDate: payload.roster_date,
    startTime: shiftDefaults.start_time,
    endTime: shiftDefaults.end_time,
  }, settings);
  assertNoBlockingConflicts(conflicts, payload.override_warnings);

  const id = createPrefixedId("roster_shift");
  const createInput = {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    payload: {
      outlet_id: payload.outlet_id,
      department_id: departmentId,
      position_id: positionId,
      employee_id: payload.employee_id,
      shift_template_id: shiftDefaults.shift_template_id,
      roster_date: payload.roster_date,
      start_time: shiftDefaults.start_time,
      end_time: shiftDefaults.end_time,
      break_minutes: shiftDefaults.break_minutes,
      notes: payload.notes ?? null,
      source: "manual",
    },
  };
  const statements = [
    repository.buildCreateRosterStatement(env, createInput),
    ...repository.createConflictStatements(env, conflictRows(context, id, payload.employee_id, payload.outlet_id, departmentId, conflicts)),
  ];
  await repository.createRosterShiftBatch(env, statements);
  const roster_shift = await repository.findRosterShift(env, context.companyId, id);
  await audit(env, context, { action: "ROSTER_SHIFT_CREATED", entityType: "roster_shift", entityId: id, employeeId: payload.employee_id, outletId: payload.outlet_id, reason: payload.reason, newValue: roster_shift });
  return { roster_shift, conflicts };
};

export const updateRosterShift = async (env: Env, context: AuthActor, id: string, payload: RosterShiftUpdateInput) => {
  assertManageRoster(context);
  const existing = await repository.findRosterShift(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested roster shift could not be found.");
  assertOutletAccess(context, existing.outlet_id);
  assertOutletAccess(context, payload.outlet_id);
  if (existing.status === "cancelled" || existing.status === "completed") {
    throw new AppError({ code: "ROSTER_NOT_EDITABLE", message: "This roster shift cannot be edited.", statusCode: 409, retryable: false });
  }
  const employeeId = payload.employee_id ?? existing.employee_id;
  const employee = await assertEmployeeAccess(env, context, employeeId);
  const settings = await getRosterSettings(env, context.companyId);
  const shiftDefaults = await withTemplateDefaults(env, context.companyId, payload, existing);
  const next = {
    outlet_id: payload.outlet_id ?? existing.outlet_id,
    department_id: payload.department_id ?? existing.department_id ?? employee.department_id ?? null,
    position_id: payload.position_id ?? existing.position_id ?? employee.position_id ?? null,
    employee_id: employeeId,
    shift_template_id: shiftDefaults.shift_template_id,
    roster_date: payload.roster_date ?? existing.roster_date,
    start_time: shiftDefaults.start_time,
    end_time: shiftDefaults.end_time,
    break_minutes: shiftDefaults.break_minutes,
    status: payload.status,
    notes: payload.notes,
  };
  assertOutletAccess(context, next.outlet_id);
  const conflicts = await detectConflicts(env, context, {
    employee,
    outletId: next.outlet_id,
    departmentId: next.department_id,
    rosterDate: next.roster_date,
    startTime: next.start_time,
    endTime: next.end_time,
    excludeRosterShiftId: id,
  }, settings);
  assertNoBlockingConflicts(conflicts, payload.override_warnings);

  await repository.updateRosterShift(env, context.companyId, id, next, context.actorUserId);
  await repository.clearOpenConflictsForShift(env, context.companyId, id);
  await repository.insertConflicts(env, repository.createConflictStatements(env, conflictRows(context, id, employeeId, next.outlet_id, next.department_id, conflicts)));
  const roster_shift = await repository.findRosterShift(env, context.companyId, id);
  await audit(env, context, { action: "ROSTER_SHIFT_UPDATED", entityType: "roster_shift", entityId: id, employeeId, outletId: next.outlet_id, reason: payload.reason, oldValue: existing, newValue: roster_shift });
  return { roster_shift, conflicts };
};

export const cancelRosterShift = async (env: Env, context: AuthActor, id: string, input: RosterActionInput) => {
  assertManageRoster(context);
  const existing = await repository.findRosterShift(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested roster shift could not be found.");
  assertOutletAccess(context, existing.outlet_id);
  const locked = await payrollLockConflict(env, context.companyId, existing.roster_date);
  if (locked) throw new AppError({ code: "ROSTER_PERIOD_LOCKED", message: locked.message, statusCode: 423, retryable: false });
  await repository.cancelRosterShift(env, context.companyId, id, context.actorUserId, input.reason);
  const roster_shift = await repository.findRosterShift(env, context.companyId, id);
  await audit(env, context, { action: "ROSTER_SHIFT_CANCELLED", entityType: "roster_shift", entityId: id, employeeId: existing.employee_id, outletId: existing.outlet_id, reason: input.reason, oldValue: existing, newValue: roster_shift });
  return { roster_shift };
};

const dateRange = (from: string, to: string, daysOfWeek: number[]) => {
  const days: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const allowed = new Set(daysOfWeek);
  while (current <= end) {
    if (allowed.has(current.getUTCDay())) {
      days.push(current.toISOString().slice(0, 10));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
};

const monthsInDateRange = (from: string, to: string) => {
  const months: string[] = [];
  const current = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  while (current <= end) {
    months.push(current.toISOString().slice(0, 7));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
};

const throwRosterPeriodLocked = () => {
  throw new AppError({
    code: "ROSTER_PERIOD_LOCKED",
    message: "This roster range includes a finalized payroll or locked attendance period and cannot be published.",
    statusCode: 423,
    retryable: false,
  });
};

const assertPublishRangeUnlocked = async (env: Env, context: AuthActor, payload: RosterPublishInput) => {
  for (const month of monthsInDateRange(payload.date_from, payload.date_to)) {
    try {
      await assertPayrollMonthUnlocked(env, context.companyId, month);
    } catch (error) {
      if (error instanceof LockedRecordError) throwRosterPeriodLocked();
      throw error;
    }
  }
  const lockedAttendance = await repository.findLockedAttendanceSummaryInRange(env, {
    companyId: context.companyId,
    outletId: payload.outlet_id,
    departmentId: payload.department_id,
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
  });
  if (lockedAttendance) throwRosterPeriodLocked();
};

export const bulkCreateRoster = async (env: Env, context: AuthActor, payload: RosterBulkInput) => {
  assertManageRoster(context);
  assertOutletAccess(context, payload.outlet_id);
  const settings = await getRosterSettings(env, context.companyId);
  const template = await repository.findShiftTemplate(env, context.companyId, payload.shift_template_id);
  if (!template || template.status !== "active" || template.active !== 1) {
    throw new AppError({ code: "SHIFT_TEMPLATE_NOT_AVAILABLE", message: "This shift template is not available.", statusCode: 400, retryable: false });
  }
  const dates = dateRange(payload.date_from, payload.date_to, payload.days_of_week);
  const statements: D1PreparedStatement[] = [];
  const createdIds: string[] = [];
  let skipped_existing = 0;
  const allConflicts: DetectedConflict[] = [];

  for (const employeeId of payload.employee_ids) {
    const employee = await assertEmployeeAccess(env, context, employeeId);
    for (const rosterDate of dates) {
      const duplicate = await repository.findDuplicateRosterShift(env, context.companyId, employeeId, rosterDate, payload.shift_template_id);
      if (duplicate) {
        skipped_existing += 1;
        continue;
      }
      const departmentId = payload.department_id ?? employee.department_id ?? template.department_id ?? null;
      const positionId = payload.position_id ?? employee.position_id ?? null;
      const conflicts = await detectConflicts(env, context, {
        employee,
        outletId: payload.outlet_id,
        departmentId,
        rosterDate,
        startTime: template.start_time,
        endTime: template.end_time,
      }, settings);
      assertNoBlockingConflicts(conflicts, payload.override_warnings);
      allConflicts.push(...conflicts);
      const id = createPrefixedId("roster_shift");
      createdIds.push(id);
      const createInput = {
        id,
        companyId: context.companyId,
        actorUserId: context.actorUserId,
        payload: {
          outlet_id: payload.outlet_id,
          department_id: departmentId,
          position_id: positionId,
          employee_id: employeeId,
          shift_template_id: payload.shift_template_id,
          roster_date: rosterDate,
          start_time: template.start_time,
          end_time: template.end_time,
          break_minutes: template.break_minutes,
          notes: payload.notes ?? null,
          source: "bulk",
        },
      };
      statements.push(repository.buildCreateRosterStatement(env, createInput));
      statements.push(...repository.createConflictStatements(env, conflictRows(context, id, employeeId, payload.outlet_id, departmentId, conflicts)));
    }
  }

  await repository.createRosterShiftBatch(env, statements);
  await audit(env, context, { action: "ROSTER_BULK_CREATED", entityType: "roster_shift", outletId: payload.outlet_id, reason: payload.reason, newValue: { created: createdIds.length, skipped_existing } });
  return { created: createdIds.length, skipped_existing, roster_shift_ids: createdIds, conflicts: allConflicts };
};

export const publishRoster = async (env: Env, context: AuthActor, payload: RosterPublishInput) => {
  assertPublishRoster(context);
  assertOutletAccess(context, payload.outlet_id);
  await assertPublishRangeUnlocked(env, context, payload);
  const blocking = await repository.countOpenBlockingConflictsInRange(env, {
    companyId: context.companyId,
    outletId: payload.outlet_id,
    departmentId: payload.department_id,
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
  });
  if ((blocking?.total ?? 0) > 0) {
    throw new AppError({
      code: "ROSTER_CONFLICT",
      message: "Roster cannot be published while blocking conflicts are unresolved.",
      statusCode: 409,
      retryable: false,
    });
  }
  await repository.publishRosterRange(env, {
    companyId: context.companyId,
    outletId: payload.outlet_id,
    departmentId: payload.department_id,
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
    actorUserId: context.actorUserId,
  });
  await audit(env, context, { action: "ROSTER_PUBLISHED", entityType: "roster_shift", outletId: payload.outlet_id, reason: payload.reason, newValue: payload });
  return { published: true };
};

export const listConflicts = async (env: Env, context: AuthActor, filters: RosterConflictFilters) => {
  assertViewRoster(context);
  if (filters.outlet_id) assertOutletAccess(context, filters.outlet_id);
  const result = await repository.listConflicts(env, context.companyId, filters, context.outletIds, context.isSuperAdmin);
  return { rows: result.rows, pagination: pagination(filters, result.total) };
};

const updateConflictStatus = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: RosterActionInput,
  status: "resolved" | "overridden",
) => {
  assertResolveRosterConflict(context);
  const conflict = await repository.findConflictById(env, context.companyId, id);
  if (!conflict) throw new NotFoundError("The requested roster conflict could not be found.");
  assertOutletAccess(context, conflict.outlet_id);
  if (conflict.status !== "open") {
    throw new AppError({
      code: "ROSTER_CONFLICT_ALREADY_REVIEWED",
      message: "This roster conflict has already been reviewed.",
      statusCode: 409,
      retryable: false,
    });
  }
  await repository.updateConflictStatus(env, {
    companyId: context.companyId,
    id,
    status,
    actorUserId: context.actorUserId,
    resolutionNote: input.reason,
  });
  await audit(env, context, {
    action: status === "resolved" ? "ROSTER_CONFLICT_RESOLVED" : "ROSTER_CONFLICT_OVERRIDDEN",
    entityType: "roster_conflict",
    entityId: id,
    employeeId: conflict.employee_id ?? undefined,
    outletId: conflict.outlet_id,
    reason: input.reason,
    oldValue: conflict,
    newValue: { status, resolution_note: input.reason },
  });
  return { conflict: await repository.findConflictById(env, context.companyId, id) };
};

export const resolveConflict = (env: Env, context: AuthActor, id: string, input: RosterActionInput) =>
  updateConflictStatus(env, context, id, input, "resolved");

export const overrideConflict = (env: Env, context: AuthActor, id: string, input: RosterActionInput) =>
  updateConflictStatus(env, context, id, input, "overridden");

export const getExpectedRosterForEmployeeDate = repository.getExpectedRosterForEmployeeDate;
