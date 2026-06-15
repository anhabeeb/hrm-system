import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { createAuditLog } from "../../services/audit.service";
import { assertPayrollMonthUnlocked, getPayrollMonthFromDate } from "../payroll/payroll-lock.service";
import * as holidayCalculation from "../holidays/holiday-calculation.service";
import * as holidayService from "../holidays/holidays.service";
import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, LockedRecordError, NotFoundError, OutletAccessError, PermissionError, ValidationError } from "../../utils/errors";
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
  RosterChangeFilters,
  RosterChangeRequestInput,
  RosterChangeRequestRecord,
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

const ROSTER_CHANGE_OPERATION = "ROSTER_CHANGE" as const;
const ROSTER_CHANGE_SUBJECT_TYPE = "ROSTER_CHANGE";

const hasRosterChangePermission = (context: AuthActor, permission: string) =>
  context.isSuperAdmin || permissionService.hasPermission(context, permission);

const isGlobalRosterChangeManager = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  context.isAdmin ||
  context.roleKeys.some((role) => ["admin", "owner", "super_admin", "hr_admin", "hr_officer"].includes(role));

const assertViewRosterChanges = (context: AuthActor) => {
  if (
    hasRosterChangePermission(context, "roster.changes.view") ||
    hasRosterChangePermission(context, "roster.changes.audit.view") ||
    hasRosterChangePermission(context, "roster.changes.create") ||
    hasRosterChangePermission(context, "roster.changes.cancel") ||
    hasRosterChangePermission(context, "approvals.department.view") ||
    hasRosterChangePermission(context, "approvals.hrFinal.view")
  ) return;
  throw new PermissionError("You do not have permission to view roster change requests.", "ROSTER_CHANGE_PERMISSION_DENIED");
};

const assertCreateRosterChange = (context: AuthActor) => {
  if (hasRosterChangePermission(context, "roster.changes.create") || hasRosterChangePermission(context, "roster.changes.createForOthers")) return;
  throw new PermissionError("You do not have permission to create roster change requests.", "ROSTER_CHANGE_PERMISSION_DENIED");
};

const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);

const activeEmployee = (employee: RosterEmployeeRecord | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !LEAVING_STATUSES.includes(employee.employment_status as any));

const assertRosterChangeSubjectAllowed = async (env: Env, context: AuthActor, employeeId?: string | null) => {
  const requesterEmployee = await actorEmployee(env, context);
  const canCreateForOthers = hasRosterChangePermission(context, "roster.changes.createForOthers");
  const subjectEmployeeId = employeeId ?? requesterEmployee?.id ?? null;
  if (!subjectEmployeeId) {
    throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.", "EMPLOYEE_PROFILE_NOT_LINKED");
  }
  if (!canCreateForOthers && !activeEmployee(requesterEmployee)) {
    throw new PermissionError("Your employee profile is not active. Please contact HR.", "EMPLOYEE_PROFILE_NOT_ACTIVE");
  }
  if (!canCreateForOthers && requesterEmployee?.id !== subjectEmployeeId) {
    throw new PermissionError("You cannot create roster change requests for another employee.", "ROSTER_CHANGE_CREATE_FOR_OTHERS_REQUIRED");
  }
  const subject = await assertEmployeeAccess(env, context, subjectEmployeeId);
  if (!activeEmployee(subject)) {
    throw new ValidationError("Please choose an active employee for this roster change request.");
  }
  if (canCreateForOthers && requesterEmployee?.id !== subject.id && !isGlobalRosterChangeManager(context)) {
    if (!activeEmployee(requesterEmployee)) {
      throw new PermissionError("Your employee profile is not active. Please contact HR.", "EMPLOYEE_PROFILE_NOT_ACTIVE");
    }
    if (requesterEmployee?.department_id !== subject.department_id) {
      throw new PermissionError("Department managers can create roster change requests only for employees in their own department.", "ROSTER_CHANGE_DEPARTMENT_SCOPE_REQUIRED");
    }
    const actorLevel = requesterEmployee?.level ?? 0;
    const subjectLevel = subject.level ?? 99;
    if (actorLevel <= subjectLevel) {
      throw new PermissionError("Department managers can create roster change requests only for lower-level employees.", "ROSTER_CHANGE_LOWER_LEVEL_REQUIRED");
    }
  }
  return { requesterEmployee, subject };
};

const rosterChangeStatusFromApproval = (approval: any) => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "APPROVED";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("hr")) return "PENDING_HR_APPROVAL";
  return "PENDING_DEPARTMENT_APPROVAL";
};

const buildRosterChangeVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (
    permissionService.isSuperAdmin(context) ||
    permissionService.hasPermission(context, "roster.changes.view") ||
    permissionService.hasPermission(context, "approvals.requests.view")
  ) return { sql: undefined, values: [] as unknown[] };

  const clauses = ["rc.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("rc.employee_id = ?", "rc.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"])) {
    clauses.push(`(rc.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = rc.company_id AND s.approval_request_id = rc.approval_request_id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["approvals.hrFinal.view", "approvals.hrFinal.approve", "approvals.hrFinal.reject"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = rc.company_id AND s.approval_request_id = rc.approval_request_id
         AND s.approver_resolver_type = 'HR_FINAL_APPROVER'
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

const assertCanViewRosterChange = async (env: Env, context: AuthActor, change: RosterChangeRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "roster.changes.view")) return;
  if (change.requester_user_id === context.actorUserId) return;
  const employee = await actorEmployee(env, context);
  if (employee?.id && (change.employee_id === employee.id || change.requester_employee_id === employee.id)) return;
  if (change.approval_request_id) {
    try {
      await approvalEngineService.getTimeline(env, context, change.approval_request_id);
      return;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  // Department visibility policy: department view/approve/reject permissions allow
  // same-department roster-change visibility; approval actions remain separately gated.
  if (employee?.department_id && employee.department_id === change.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"])) return;
  throw new PermissionError("You do not have access to this roster change request.");
};

const parseRequestedValue = (change: RosterChangeRequestRecord) =>
  parseJson<Record<string, any>>(change.requested_value_json, {});

const prevalidateRosterChangeApplication = async (env: Env, context: AuthActor, change: RosterChangeRequestRecord) => {
  if (!change.employee_id) throw new ValidationError("Roster change employee is required.");
  const employee = await assertEmployeeAccess(env, context, change.employee_id);
  const requested = parseRequestedValue(change);
  const rosterDate = change.requested_date ?? requested.roster_date;
  if (!rosterDate) throw new ValidationError("Requested roster date is required.");
  const startTime = change.requested_start_at ?? requested.start_time;
  const endTime = change.requested_end_at ?? requested.end_time;
  if (["SHIFT_CREATE", "SHIFT_UPDATE", "SHIFT_TIME_CHANGE"].includes(change.change_type) && (!startTime || !endTime)) {
    throw new ValidationError("Requested start and end times are required.");
  }
  if (change.shift_id) {
    const shift = await repository.findRosterShift(env, context.companyId, change.shift_id);
    if (!shift || shift.employee_id !== change.employee_id) {
      throw new ConflictError("The roster shift does not belong to the selected employee.");
    }
    assertOutletAccess(context, shift.outlet_id);
  }
  if (startTime && endTime) {
    const outletId = change.outlet_id ?? requested.outlet_id ?? employee.primary_outlet_id;
    if (!outletId) throw new ValidationError("An outlet is required for this roster change request.");
    const settings = await getRosterSettings(env, context.companyId);
    const conflicts = await detectConflicts(env, context, {
      employee,
      outletId,
      departmentId: change.department_id ?? employee.department_id,
      rosterDate,
      startTime,
      endTime,
      excludeRosterShiftId: change.shift_id ?? undefined,
    }, settings);
    assertNoBlockingConflicts(conflicts, Boolean(requested.override_warnings));
  }
  return { employee, requested, rosterDate, startTime, endTime };
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

export const listRosterChangeRequests = async (env: Env, context: AuthActor, filters: RosterChangeFilters) => {
  assertViewRosterChanges(context);
  if (filters.outlet_id) assertOutletAccess(context, filters.outlet_id);
  const visibility = await buildRosterChangeVisibilityFilter(env, context);
  const result = await repository.listRosterChanges(env, context.companyId, filters, visibility.sql, visibility.values);
  return { rows: result.rows, pagination: pagination(filters, result.total) };
};

export const getRosterChangeRequest = async (env: Env, context: AuthActor, id: string) => {
  const change = await repository.findRosterChangeById(env, context.companyId, id);
  if (!change) throw new NotFoundError("The requested roster change request could not be found.");
  await assertCanViewRosterChange(env, context, change);
  if (change.outlet_id) assertOutletAccess(context, change.outlet_id);
  return { roster_change: change };
};

export const createRosterChangeRequest = async (env: Env, context: AuthActor, payload: RosterChangeRequestInput) => {
  assertCreateRosterChange(context);
  const { requesterEmployee, subject } = await assertRosterChangeSubjectAllowed(env, context, payload.employee_id);
  const existingShift = payload.shift_id ? await repository.findRosterShift(env, context.companyId, payload.shift_id) : null;
  if (payload.shift_id && (!existingShift || existingShift.employee_id !== subject.id)) {
    throw new ConflictError("The roster shift does not belong to the selected employee.");
  }
  if (existingShift?.outlet_id) assertOutletAccess(context, existingShift.outlet_id);
  const requestedValue: Record<string, unknown> = {
    ...(payload.requested_value_json ?? {}),
    override_warnings: payload.override_warnings === true,
  };
  const requestedDate = payload.requested_date ?? existingShift?.roster_date ?? (requestedValue.roster_date as string | undefined) ?? null;
  const outletId = existingShift?.outlet_id ?? (requestedValue.outlet_id as string | undefined) ?? subject.primary_outlet_id;
  if (!outletId) throw new ValidationError("An outlet is required for this roster change request.");
  assertOutletAccess(context, outletId);
  const duplicate = await repository.findDuplicatePendingRosterChange(env, {
    companyId: context.companyId,
    employeeId: subject.id,
    requestedDate,
    changeType: payload.change_type,
    shiftId: payload.shift_id ?? null,
    rosterId: payload.roster_id ?? null,
  });
  if (duplicate) throw new ConflictError("A pending roster change already exists for this date/shift.");

  const id = createPrefixedId("roster_change");
  await repository.createRosterChangeRequest(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    payload: {
      employee_id: subject.id,
      requester_employee_id: requesterEmployee?.id ?? null,
      requester_user_id: context.actorUserId,
      department_id: subject.department_id ?? null,
      position_id: subject.position_id ?? null,
      level: subject.level ?? null,
      outlet_id: outletId,
      store_id: outletId,
      roster_id: payload.roster_id ?? null,
      shift_id: payload.shift_id ?? null,
      source_roster_id: payload.source_roster_id ?? null,
      target_roster_id: payload.target_roster_id ?? null,
      source_shift_id: payload.source_shift_id ?? null,
      target_shift_id: payload.target_shift_id ?? null,
      change_type: payload.change_type,
      requested_date: requestedDate,
      requested_start_at: payload.requested_start_at ?? (requestedValue.start_time as string | undefined) ?? null,
      requested_end_at: payload.requested_end_at ?? (requestedValue.end_time as string | undefined) ?? null,
      requested_break_start: payload.requested_break_start ?? null,
      requested_break_end: payload.requested_break_end ?? null,
      current_value_json: existingShift ? JSON.stringify(existingShift) : null,
      requested_value_json: JSON.stringify(requestedValue),
      reason: payload.reason,
      employee_note: payload.employee_note ?? null,
      manager_note: payload.manager_note ?? null,
    },
  });
  const change = await repository.findRosterChangeById(env, context.companyId, id);
  if (!change) throw new NotFoundError("The roster change request could not be created.");
  await prevalidateRosterChangeApplication(env, context, change);
  await audit(env, context, { action: "ROSTER_CHANGE_REQUEST_CREATED", entityType: "roster_change_request", entityId: id, employeeId: subject.id, outletId, reason: payload.reason, newValue: change });
  return { roster_change: change };
};

export const submitRosterChangeForApproval = async (env: Env, context: AuthActor, id: string) => {
  const change = (await getRosterChangeRequest(env, context, id)).roster_change;
  if (["APPROVED", "REJECTED", "CANCELLED", "APPLIED", "FAILED_TO_APPLY"].includes(change.status)) {
    throw new ConflictError("This roster change request has already been approved/rejected/cancelled.");
  }
  if (change.approval_request_id) {
    return { roster_change: change, already_submitted: true };
  }
  await prevalidateRosterChangeApplication(env, context, change);
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: ROSTER_CHANGE_OPERATION,
    subject_type: ROSTER_CHANGE_SUBJECT_TYPE,
    subject_id: change.id,
    requester_employee_id: change.requester_employee_id,
    subject_employee_id: change.employee_id,
    department_id: change.department_id,
    position_id: change.position_id,
    level: change.level,
    title: `Roster change ${change.change_type}`,
    summary: change.reason,
    payload_json: {
      roster_change_request_id: change.id,
      change_type: change.change_type,
      requested_date: change.requested_date,
      shift_id: change.shift_id,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "roster.changes.createForOthers",
    moduleOperationType: ROSTER_CHANGE_OPERATION,
  });
  if (!draft) throw new ValidationError("No active roster change approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = rosterChangeStatusFromApproval(submitted);
  await repository.updateRosterChangeApprovalLink(env, context.companyId, change.id, {
    approvalRequestId: draft.id,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStepId: submitted?.current_step_id ?? null,
    status,
    actorUserId: context.actorUserId,
  });
  const updated = await repository.findRosterChangeById(env, context.companyId, change.id);
  await audit(env, context, { action: "ROSTER_CHANGE_SUBMITTED_FOR_APPROVAL", entityType: "roster_change_request", entityId: change.id, employeeId: change.employee_id ?? undefined, outletId: change.outlet_id, reason: change.reason, newValue: { approval_request_id: draft.id, status } });
  return { roster_change: updated, already_submitted: false };
};

const applyApprovedRosterChange = async (env: Env, context: AuthActor, change: RosterChangeRequestRecord) => {
  const { employee, requested, rosterDate, startTime, endTime } = await prevalidateRosterChangeApplication(env, context, change);
  const outletId = change.outlet_id ?? requested.outlet_id ?? employee.primary_outlet_id;
  if (!outletId) throw new ValidationError("An outlet is required before this roster change can be applied.");
  if (change.change_type === "SHIFT_CREATE") {
    const rosterId = createPrefixedId("roster_shift");
    await repository.createRosterShift(env, {
      id: rosterId,
      companyId: context.companyId,
      actorUserId: context.actorUserId,
      payload: {
        outlet_id: outletId,
        department_id: change.department_id,
        position_id: change.position_id,
        employee_id: employee.id,
        shift_template_id: requested.shift_template_id ?? null,
        roster_date: rosterDate,
        start_time: startTime,
        end_time: endTime,
        break_minutes: Number(requested.break_minutes ?? 0),
        notes: requested.notes ?? change.employee_note ?? null,
        source: "approval_roster_change",
      },
    });
    return rosterId;
  }
  if ((change.change_type === "SHIFT_UPDATE" || change.change_type === "SHIFT_TIME_CHANGE") && change.shift_id) {
    await repository.updateRosterShiftForEmployee(env, context.companyId, change.shift_id, employee.id, {
      outlet_id: outletId,
      department_id: change.department_id,
      position_id: change.position_id,
      roster_date: rosterDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: requested.break_minutes === undefined ? undefined : Number(requested.break_minutes),
      notes: requested.notes ?? undefined,
    }, context.actorUserId);
    return change.shift_id;
  }
  if (change.change_type === "SHIFT_DELETE" && change.shift_id) {
    await repository.cancelRosterShiftForEmployee(env, context.companyId, change.shift_id, employee.id, context.actorUserId, change.reason);
    return change.shift_id;
  }
  throw new ValidationError("This roster change type needs manual assignment before it can be applied.");
};

export const approveRosterChangeStep = async (env: Env, context: AuthActor, id: string, input: RosterActionInput) => {
  const change = (await getRosterChangeRequest(env, context, id)).roster_change;
  if (!change.approval_request_id) throw new ConflictError("This roster change request has not been submitted for approval.");
  await prevalidateRosterChangeApplication(env, context, change);
  const approval = await approvalEngineService.approveStep(env, context, change.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: ROSTER_CHANGE_OPERATION });
  const status = rosterChangeStatusFromApproval(approval);
  const update: Record<string, unknown> = {
    approval_status: approval?.status ?? null,
    approval_current_step: approval?.current_step_id ?? null,
    status,
    updated_by: context.actorUserId,
  };
  if (status === "PENDING_HR_APPROVAL") {
    update.department_approved_at = new Date().toISOString();
    update.department_approved_by = context.actorUserId;
  }
  if (approval?.status === "APPROVED") {
    update.hr_approved_at = new Date().toISOString();
    update.hr_approved_by = context.actorUserId;
    update.approval_completed_at = new Date().toISOString();
    try {
      await applyApprovedRosterChange(env, context, change);
      update.status = "APPLIED";
      update.applied_at = new Date().toISOString();
      update.applied_by = context.actorUserId;
    } catch (error) {
      update.status = "FAILED_TO_APPLY";
      update.apply_error_code = error instanceof AppError ? error.code : "ROSTER_CHANGE_APPLY_FAILED";
      update.apply_error_message = error instanceof Error ? error.message : "Roster change could not be applied.";
      await audit(env, context, { action: "roster_change_apply_failed", entityType: "roster_change_request", entityId: change.id, employeeId: change.employee_id ?? undefined, outletId: change.outlet_id, reason: input.reason, newValue: { error: update.apply_error_message } });
    }
  }
  await repository.updateRosterChangeStatus(env, context.companyId, change.id, update);
  return { roster_change: await repository.findRosterChangeById(env, context.companyId, change.id), approval_request: approval };
};

export const rejectRosterChangeStep = async (env: Env, context: AuthActor, id: string, input: RosterActionInput) => {
  const change = (await getRosterChangeRequest(env, context, id)).roster_change;
  if (!change.approval_request_id) throw new ConflictError("This roster change request has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, change.approval_request_id, input.reason, input.reason, { allowModuleBoundAction: true, moduleOperationType: ROSTER_CHANGE_OPERATION });
  await repository.updateRosterChangeStatus(env, context.companyId, change.id, {
    status: "REJECTED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  return { roster_change: await repository.findRosterChangeById(env, context.companyId, change.id), approval_request: approval };
};

export const cancelRosterChangeRequest = async (env: Env, context: AuthActor, id: string, input: RosterActionInput) => {
  const change = (await getRosterChangeRequest(env, context, id)).roster_change;
  if (["APPROVED", "REJECTED", "CANCELLED", "APPLIED", "FAILED_TO_APPLY"].includes(change.status)) {
    throw new ConflictError("This roster change request has already been approved/rejected/cancelled.");
  }
  const approval = change.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, change.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "roster.changes.cancel",
      moduleCancelAnyPermission: "roster.changes.cancelAny",
      moduleOperationType: ROSTER_CHANGE_OPERATION,
    })
    : null;
  await repository.updateRosterChangeStatus(env, context.companyId, change.id, {
    status: "CANCELLED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    updated_by: context.actorUserId,
  });
  return { roster_change: await repository.findRosterChangeById(env, context.companyId, change.id), approval_request: approval };
};

export const getRosterChangeApprovalTimeline = async (env: Env, context: AuthActor, id: string) => {
  const change = (await getRosterChangeRequest(env, context, id)).roster_change;
  if (!change.approval_request_id) return { roster_change: change, request: null, steps: [], actions: [] };
  const timeline = await approvalEngineService.getTimeline(env, context, change.approval_request_id);
  return { roster_change: change, ...timeline };
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
