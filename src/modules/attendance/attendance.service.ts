import * as repository from "./attendance.repository";
import { rebuildDailySummary } from "./attendance-summary.service";
import { createAttendanceConflict } from "./attendance-conflict.service";
import { ATTENDANCE_SUMMARY_STATUSES } from "./attendance.constants";
import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import {
  assertNoDuplicatePunch,
  findExistingLocalEvent,
  hasClockInForDate,
} from "./attendance-dedupe.service";
import type {
  AttendanceEventInput,
  AttendanceListFilters,
  AttendanceMethod,
  AttendanceOutletScope,
  AttendanceSource,
  ConflictResolveInput,
  CorrectionRequestInput,
  KioskClockInput,
  ManualBatchInput,
  ManualBatchRowError,
  ManualEntryInput,
  ReviewInput,
} from "./attendance.types";
import { createAuditLog } from "../../services/audit.service";
import * as settingsService from "../../services/settings.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, DeviceAuthContext, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  ConflictError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  PermissionError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const dateOf = (value: string) => value.slice(0, 10);
const MALDIVES_OFFSET = "+05:00";
const ATTENDANCE_CORRECTION_OPERATION = "ATTENDANCE_CORRECTION" as const;
const ATTENDANCE_CORRECTION_SUBJECT_TYPE = "ATTENDANCE_CORRECTION";
const SUPPORTED_CORRECTION_TYPES = new Set(["clock_in_time", "clock_out_time", "status", "manual_summary_update"]);
const sensitivePayloadKeys = new Set(["password", "password_hash", "token", "session_token", "reset_token", "totp_secret", "secret"]);

type AttendanceSubFeatureKey =
  | "attendance.manual_entry_enabled"
  | "attendance.kiosk_enabled"
  | "attendance.biometric_enabled"
  | "attendance.corrections_enabled"
  | "attendance.payroll_deductions_enabled";

const attendanceSubFeatureAliases: Record<AttendanceSubFeatureKey, string[]> = {
  "attendance.manual_entry_enabled": ["attendance.manual_entry_enabled", "manual_attendance_enabled"],
  "attendance.kiosk_enabled": ["attendance.kiosk_enabled", "kiosk_mode_enabled"],
  "attendance.biometric_enabled": ["attendance.biometric_enabled", "biometric_enabled"],
  "attendance.corrections_enabled": ["attendance.corrections_enabled", "attendance_correction_enabled"],
  "attendance.payroll_deductions_enabled": ["attendance.payroll_deductions_enabled", "absent_day_deduction_enabled", "deduct_absent_days"],
};

const attendanceSubFeatureDefaults: Record<AttendanceSubFeatureKey, boolean> = {
  "attendance.manual_entry_enabled": true,
  "attendance.kiosk_enabled": true,
  "attendance.biometric_enabled": false,
  "attendance.corrections_enabled": true,
  "attendance.payroll_deductions_enabled": true,
};

const readAttendanceSubFeature = (
  settings: Record<string, unknown>,
  canonicalKey: AttendanceSubFeatureKey,
) => {
  const aliases = attendanceSubFeatureAliases[canonicalKey] ?? [canonicalKey];
  const matched = aliases.find((key) => typeof settings[key] === "boolean");
  return matched ? settings[matched] === true : attendanceSubFeatureDefaults[canonicalKey];
};

export const getAttendanceSubFeatures = async (env: Env, context: AuthActor) => {
  const settings = await settingsService.getAttendanceSettings(env, context.companyId).catch(() => ({}));
  return {
    manual_entry_enabled: readAttendanceSubFeature(settings, "attendance.manual_entry_enabled"),
    kiosk_enabled: readAttendanceSubFeature(settings, "attendance.kiosk_enabled"),
    biometric_enabled: readAttendanceSubFeature(settings, "attendance.biometric_enabled"),
    corrections_enabled: readAttendanceSubFeature(settings, "attendance.corrections_enabled"),
    payroll_deductions_enabled: readAttendanceSubFeature(settings, "attendance.payroll_deductions_enabled"),
  };
};

export const normalizeAttendanceDateTime = (
  attendanceDate: string,
  timeOrDateTime: string,
): string => {
  const value = timeOrDateTime.trim();

  if (/^\d{2}:\d{2}$/.test(value)) {
    return `${attendanceDate}T${value}:00${MALDIVES_OFFSET}`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${attendanceDate}T${value}${MALDIVES_OFFSET}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new ValidationError("Please enter a valid attendance time.");
  }

  return value;
};

const outletScope = (context: AuthActor): AttendanceOutletScope => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const assertOutletAccess = (context: AuthActor, outletId: string) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
};

export const assertAttendanceOutletAccess = (
  context: AuthActor,
  outletId: string,
) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this attendance record.");
  }
};

export const getAttendanceDateFromEventTime = (eventTime: string): string =>
  eventTime.slice(0, 10);

export const getPayrollMonthFromAttendanceDate = (attendanceDate: string): string =>
  attendanceDate.slice(0, 7);

const assertPayrollUnlocked = async (
  env: Env,
  companyId: string,
  attendanceDate: string,
) => {
  const run = await repository.findPayrollRunForMonth(
    env,
    companyId,
    attendanceDate.slice(0, 7),
  );
  if (["finalizing", "finalized", "locked", "paid"].includes(run?.status ?? "")) {
    throw new LockedRecordError(
      "This attendance period is locked because payroll has been finalized.",
    );
  }
};

export const assertPayrollMonthsUnlocked = async (
  env: Env,
  companyId: string,
  months: Iterable<string | undefined | null>,
) => {
  for (const month of new Set([...months].filter(Boolean) as string[])) {
    const run = await repository.findPayrollRunForMonth(env, companyId, month);
    if (["finalizing", "finalized", "locked", "paid"].includes(run?.status ?? "")) {
      throw new LockedRecordError(
        "This attendance period is locked because payroll has been finalized.",
      );
    }
  }
};

const ensureEmployee = async (env: Env, companyId: string, employeeId: string) => {
  const employee = await repository.findEmployeeForAttendance(env, companyId, employeeId);
  if (!employee || employee.deleted_at || employee.archived_at) {
    throw new NotFoundError("The requested employee could not be found.");
  }
  if (["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status)) {
    throw new ValidationError("This employee is not active for attendance.");
  }
  return employee;
};

const actorLinkedEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);

export const canCreateAttendanceCorrectionForEmployee = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "attendance.corrections.createForOthers")) return true;
  const linked = await actorLinkedEmployee(env, context);
  if (linked?.id === employeeId && !linked.deleted_at && !linked.archived_at && !["inactive", "archived", "deleted"].includes(linked.employment_status)) return true;
  throw new PermissionError("You cannot create attendance corrections for another employee.");
};

const normalizeCorrectionPayload = (input: CorrectionRequestInput): Record<string, unknown> => {
  if (input.new_value_json) return input.new_value_json;
  const payload: Record<string, unknown> = {
    attendance_date: input.attendance_date,
    outlet_id: input.outlet_id,
  };
  if (input.requested_clock_in) payload.time = input.requested_clock_in;
  if (input.requested_clock_out) payload.time = input.requested_clock_out;
  if (input.requested_status) payload.status = input.requested_status;
  return payload;
};

const correctionRequestedDate = (input: CorrectionRequestInput, value: Record<string, unknown>) =>
  input.attendance_date ??
  (typeof value.attendance_date === "string" ? value.attendance_date : undefined) ??
  (typeof value.event_time === "string" ? value.event_time.slice(0, 10) : undefined);

const correctionStatusFromApproval = async (
  env: Env,
  companyId: string,
  approvalRequestId: string | null | undefined,
  fallbackStatus: string,
) => {
  if (!approvalRequestId) return { status: fallbackStatus, currentStepId: null as string | null, currentStepName: null as string | null };
  const timeline = await approvalEngineService.getTimeline(env, {
    companyId,
    actorUserId: "__system__",
    fullName: "System",
    email: null,
    roles: [],
    permissions: ["approvals.requests.view"],
    roleKeys: [],
    outletIds: [],
    isSuperAdmin: false,
    isAdmin: false,
    ipAddress: null,
    userAgent: null,
    requestId: undefined,
  }, approvalRequestId).catch(() => null);
  const current = timeline?.steps.find((step) => step.id === timeline.request.current_step_id) ?? timeline?.steps.find((step) => ["PENDING", "WAITING_FOR_APPROVER", "ESCALATED"].includes(step.status));
  if (current?.approver_resolver_type === "HR_FINAL_APPROVER") return { status: "PENDING_HR_APPROVAL", currentStepId: current.id, currentStepName: current.step_name };
  if (current?.approver_resolver_type?.startsWith("DEPARTMENT")) return { status: "PENDING_DEPARTMENT_APPROVAL", currentStepId: current.id, currentStepName: current.step_name };
  if (timeline?.request.status === "NEEDS_MANUAL_ASSIGNMENT" || timeline?.request.status === "ESCALATED") return { status: "PENDING_MANUAL_REVIEW", currentStepId: current?.id ?? null, currentStepName: current?.step_name ?? null };
  return { status: fallbackStatus, currentStepId: current?.id ?? null, currentStepName: current?.step_name ?? null };
};

const audit = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    module: "attendance" | "kiosk";
    action: string;
    entityType: string;
    entityId: string;
    employeeId?: string;
    actorUserId?: string;
    deviceId?: string | null;
    reason?: string;
    details?: Record<string, unknown>;
    requestId?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    required?: boolean;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: input.companyId,
    outletId: input.outletId ?? undefined,
    module: input.module,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: input.actorUserId,
    deviceId: input.deviceId ?? undefined,
    reason: input.reason,
    details: input.details,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  if (!result.created && input.required) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

const realtime = async (
  env: Env,
  companyId: string,
  type: string,
  payload: Record<string, unknown>,
  triggeredBy?: string,
) => {
  await broadcastEvent(env, {
    roomName: `company:${companyId}`,
    type,
    payload,
    triggeredBy,
  }).catch(() => undefined);
};

const createEvent = async (
  env: Env,
  input: {
    companyId: string;
    employeeId: string;
    outletId: string;
    deviceId?: string | null;
    eventType: "clock_in" | "clock_out" | "manual_entry";
    eventTime: string;
    attendanceMethod: AttendanceMethod;
    source: AttendanceSource;
    localId?: string | null;
    approvalStatus?: string;
  },
) => {
  const existing = await findExistingLocalEvent(
    env,
    input.companyId,
    input.deviceId ?? null,
    input.localId,
  );
  if (existing) return existing;
  const id = createPrefixedId("att");
  await repository.createAttendanceEvent(env, {
    id,
    company_id: input.companyId,
    employee_id: input.employeeId,
    outlet_id: input.outletId,
    device_id: input.deviceId ?? null,
    event_type: input.eventType,
    event_time: input.eventTime,
    attendance_method: input.attendanceMethod,
    source: input.source,
    local_id: input.localId ?? null,
    created_offline: 0,
    sync_status: "synced",
    approval_status: input.approvalStatus ?? "approved",
  });
  return repository.findEventById(env, input.companyId, id).then((event) => event!);
};

const directSummaryUpdate = async (
  env: Env,
  input: {
    companyId: string;
    employeeId: string;
    outletId: string;
    attendanceDate: string;
    firstClockIn?: string | null;
    lastClockOut?: string | null;
    workedMinutes?: number;
    status: any;
  },
) => {
  const payrollRun = await repository.findPayrollRunForMonth(
    env,
    input.companyId,
    input.attendanceDate.slice(0, 7),
  );
  await repository.upsertDailySummary(env, {
    id: createPrefixedId("att_sum"),
    company_id: input.companyId,
    employee_id: input.employeeId,
    outlet_id: input.outletId,
    attendance_date: input.attendanceDate,
    first_clock_in: input.firstClockIn ?? null,
    last_clock_out: input.lastClockOut ?? null,
    worked_minutes: input.workedMinutes ?? 0,
    late_minutes: 0,
    early_out_minutes: 0,
    break_minutes: 0,
    overtime_minutes: 0,
    status: input.status,
    payroll_status: ["finalizing", "finalized", "locked", "paid"].includes(payrollRun?.status ?? "")
      ? "locked"
      : "pending",
  });
};

const parseCorrectionValue = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new ValidationError("The correction details are not valid.");
  }
};

const assertSafeCorrectionPayload = (value: unknown, path = "new_value_json") => {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeCorrectionPayload(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (sensitivePayloadKeys.has(normalized) || normalized.includes("password") || normalized.includes("token") || normalized.includes("secret")) {
      throw new ValidationError(`Sensitive field ${path}.${key} cannot be stored in attendance correction payloads.`);
    }
    assertSafeCorrectionPayload(nested, `${path}.${key}`);
  }
};

const getPayloadOutletId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).outlet_id;
  return typeof value === "string" && value ? value : null;
};

const parseJsonPayload = (value: string | null | undefined): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const correctionDateTime = (value: Record<string, unknown>): string => {
  if (typeof value.event_time === "string") return normalizeAttendanceDateTime(value.event_time.slice(0, 10), value.event_time);
  if (typeof value.attendance_date === "string" && typeof value.time === "string") {
    return normalizeAttendanceDateTime(value.attendance_date, value.time);
  }
  throw new ValidationError("Please enter a valid attendance time.");
};

const assertSupportedCorrectionType = (correctionType: string) => {
  if (!SUPPORTED_CORRECTION_TYPES.has(correctionType)) {
    throw new AppError(
      "This correction type is not supported yet.",
      "UNSUPPORTED_CORRECTION_TYPE",
      400,
    );
  }
};

const assertAttendanceEventBelongsToEmployee = async (
  env: Env,
  context: AuthActor,
  input: { attendanceEventId?: string | null; employeeId: string },
) => {
  if (!input.attendanceEventId) return null;
  const event = await repository.findEventById(env, context.companyId, input.attendanceEventId);
  if (!event || event.company_id !== context.companyId || event.employee_id !== input.employeeId) {
    throw new ValidationError("The selected attendance event does not belong to this employee.");
  }
  assertAttendanceOutletAccess(context, event.outlet_id);
  return event;
};

export const resolveCorrectionOutletId = async (
  env: Env,
  companyId: string,
  correction: any,
  value: Record<string, unknown>,
  affectedDate?: string,
): Promise<string | null> => {
  if (correction.attendance_event_id) {
    const event = await repository.findEventById(
      env,
      companyId,
      correction.attendance_event_id,
    );
    if (event?.outlet_id) return event.outlet_id;
  }

  const newOutletId = getPayloadOutletId(value);
  if (newOutletId) return newOutletId;

  const employeeOutlet = await repository.findEmployeeOutlet(
    env,
    companyId,
    correction.employee_id,
  );
  if (employeeOutlet?.primary_outlet_id) return employeeOutlet.primary_outlet_id;

  const summaryDate =
    affectedDate ??
    (typeof value.attendance_date === "string" ? value.attendance_date : null);
  if (summaryDate) {
    const summaryOutlet = await repository.findSummaryOutlet(
      env,
      companyId,
      correction.employee_id,
      summaryDate,
    );
    if (summaryOutlet?.outlet_id) return summaryOutlet.outlet_id;
  }

  return null;
};

const validateCorrectionApplyReadiness = async (
  env: Env,
  context: AuthActor,
  correction: any,
  value: Record<string, unknown>,
) => {
  assertSupportedCorrectionType(correction.correction_type);
  assertSafeCorrectionPayload(value);
  const existingEvent = await assertAttendanceEventBelongsToEmployee(env, context, {
    attendanceEventId: correction.attendance_event_id,
    employeeId: correction.employee_id,
  });
  let affectedDate =
    existingEvent?.event_time.slice(0, 10) ??
    (typeof value.attendance_date === "string" ? value.attendance_date : undefined);
  if (correction.correction_type === "clock_in_time" || correction.correction_type === "clock_out_time") {
    const requestedEventTime = correctionDateTime(value);
    affectedDate = requestedEventTime.slice(0, 10);
  }
  const affectedOutletId = await resolveCorrectionOutletId(env, context.companyId, correction, value, affectedDate);
  if (!affectedOutletId) {
    throw new ValidationError("Unable to confirm outlet access for this attendance correction.");
  }
  assertAttendanceOutletAccess(context, affectedOutletId);

  if (correction.correction_type === "clock_in_time" || correction.correction_type === "clock_out_time") {
    if (!affectedDate) {
      throw new ValidationError("Please provide a valid attendance time.");
    }
    const originalDate = existingEvent?.event_time ? getAttendanceDateFromEventTime(existingEvent.event_time) : affectedDate;
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      originalDate ? getPayrollMonthFromAttendanceDate(originalDate) : null,
      getPayrollMonthFromAttendanceDate(affectedDate),
    ]);
  } else if (correction.correction_type === "status" || correction.correction_type === "manual_summary_update") {
    if (typeof value.outlet_id !== "string") value.outlet_id = affectedOutletId;
    if (typeof value.attendance_date !== "string" && affectedDate) value.attendance_date = affectedDate;
    if (typeof value.attendance_date !== "string" || typeof value.outlet_id !== "string" || typeof value.status !== "string") {
      throw new ValidationError(correction.correction_type === "status" ? "Please provide a valid attendance status correction." : "Please provide valid summary details.");
    }
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      affectedDate ? getPayrollMonthFromAttendanceDate(affectedDate) : null,
      getPayrollMonthFromAttendanceDate(value.attendance_date),
    ]);
    assertValidSummaryStatus(value.status);
  }
  return { existingEvent, affectedOutletId, affectedDate };
};

export const resolveConflictOutletId = async (
  env: Env,
  companyId: string,
  conflict: any,
): Promise<string | null> => {
  if (conflict.outlet_id) return conflict.outlet_id;

  const employeeId =
    typeof conflict.employee_id === "string" ? conflict.employee_id : null;
  if (employeeId) {
    const employeeOutlet = await repository.findEmployeeOutlet(
      env,
      companyId,
      employeeId,
    );
    if (employeeOutlet?.primary_outlet_id) return employeeOutlet.primary_outlet_id;
  }

  return (
    getPayloadOutletId(parseJsonPayload(conflict.server_payload_json)) ??
    getPayloadOutletId(parseJsonPayload(conflict.local_payload_json))
  );
};

const assertValidSummaryStatus = (status: unknown): string => {
  if (
    typeof status !== "string" ||
    !(ATTENDANCE_SUMMARY_STATUSES as readonly string[]).includes(status)
  ) {
    throw new ValidationError("Please select a valid attendance status.");
  }

  return status;
};

export const listAttendance = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceListFilters,
) => {
  const scope = outletScope(context);
  const [total, rows] = await Promise.all([
    repository.countAttendance(env, context.companyId, filters, scope),
    repository.listAttendance(env, context.companyId, filters, scope),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const listAttendanceEvents = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceListFilters,
) => {
  const scope = outletScope(context);
  const [total, rows] = await Promise.all([
    repository.countAttendanceEvents(env, context.companyId, filters, scope),
    repository.listAttendanceEvents(env, context.companyId, filters, scope),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const clockIn = async (
  env: Env,
  context: AuthActor,
  input: AttendanceEventInput,
) => {
  assertOutletAccess(context, input.outlet_id);
  const employee = await ensureEmployee(env, context.companyId, input.employee_id);
  const eventTime = input.event_time ?? nowIso();
  const attendanceDate = dateOf(eventTime);
  await assertPayrollUnlocked(env, context.companyId, attendanceDate);
  await assertNoDuplicatePunch(env, context.companyId, input.employee_id, attendanceDate, "clock_in");

  if (employee.primary_outlet_id !== input.outlet_id) {
    const conflict = await createAttendanceConflict(env, {
      companyId: context.companyId,
      employeeId: input.employee_id,
      outletId: input.outlet_id,
      conflictType: "wrong_outlet",
      localPayload: input as unknown as Record<string, unknown>,
      serverPayload: { primary_outlet_id: employee.primary_outlet_id },
      audit: {
        module: "attendance",
        actor: context,
        reason: input.reason,
        required: true,
      },
    });
    return {
      conflict_created: true,
      conflict_type: "wrong_outlet",
      conflict_id: conflict.id,
    };
  }

  const event = await createEvent(env, {
    companyId: context.companyId,
    employeeId: input.employee_id,
    outletId: input.outlet_id,
    eventType: "clock_in",
    eventTime,
    attendanceMethod: input.attendance_method ?? "manual",
    source: "admin_dashboard",
  });
  const summary = await rebuildDailySummary(env, context.companyId, input.employee_id, attendanceDate);
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id,
    module: "attendance",
    action: "attendance_clock_in",
    entityType: "attendance_event",
    entityId: event.id,
    employeeId: input.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    required: true,
  });
  await realtime(env, context.companyId, "attendance.clock_in", { event_id: event.id }, context.actorUserId);
  return { event_id: event.id, summary };
};

export const clockOut = async (
  env: Env,
  context: AuthActor,
  input: AttendanceEventInput,
) => {
  assertOutletAccess(context, input.outlet_id);
  await ensureEmployee(env, context.companyId, input.employee_id);
  const eventTime = input.event_time ?? nowIso();
  const attendanceDate = dateOf(eventTime);
  await assertPayrollUnlocked(env, context.companyId, attendanceDate);
  await assertNoDuplicatePunch(env, context.companyId, input.employee_id, attendanceDate, "clock_out");

  if (!(await hasClockInForDate(env, context.companyId, input.employee_id, attendanceDate))) {
    const conflict = await createAttendanceConflict(env, {
      companyId: context.companyId,
      employeeId: input.employee_id,
      outletId: input.outlet_id,
      conflictType: "missing_clock_in",
      localPayload: input as unknown as Record<string, unknown>,
      audit: {
        module: "attendance",
        actor: context,
        reason: input.reason,
        required: true,
      },
    });
    return {
      conflict_created: true,
      conflict_type: "missing_clock_in",
      conflict_id: conflict.id,
    };
  }

  const event = await createEvent(env, {
    companyId: context.companyId,
    employeeId: input.employee_id,
    outletId: input.outlet_id,
    eventType: "clock_out",
    eventTime,
    attendanceMethod: input.attendance_method ?? "manual",
    source: "admin_dashboard",
  });
  const summary = await rebuildDailySummary(env, context.companyId, input.employee_id, attendanceDate);
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id,
    module: "attendance",
    action: "attendance_clock_out",
    entityType: "attendance_event",
    entityId: event.id,
    employeeId: input.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    required: true,
  });
  await realtime(env, context.companyId, "attendance.clock_out", { event_id: event.id }, context.actorUserId);
  return { event_id: event.id, summary };
};

export const manualEntry = async (
  env: Env,
  context: AuthActor,
  input: ManualEntryInput,
  options: { auditRequired?: boolean } = {},
) => {
  assertOutletAccess(context, input.outlet_id);
  const employee = await ensureEmployee(env, context.companyId, input.employee_id);
  if (employee.primary_outlet_id !== input.outlet_id) {
    throw new OutletAccessError("This employee is not assigned to the selected outlet.");
  }
  await assertPayrollUnlocked(env, context.companyId, input.attendance_date);
  const eventIds: string[] = [];
  if (input.clock_in_time) {
    const eventTime = normalizeAttendanceDateTime(
      input.attendance_date,
      input.clock_in_time,
    );
    const event = await createEvent(env, {
      companyId: context.companyId,
      employeeId: input.employee_id,
      outletId: input.outlet_id,
      eventType: "clock_in",
      eventTime,
      attendanceMethod: "manual",
      source: "manager_dashboard",
    });
    eventIds.push(event.id);
  }
  if (input.clock_out_time) {
    const eventTime = normalizeAttendanceDateTime(
      input.attendance_date,
      input.clock_out_time,
    );
    const event = await createEvent(env, {
      companyId: context.companyId,
      employeeId: input.employee_id,
      outletId: input.outlet_id,
      eventType: "clock_out",
      eventTime,
      attendanceMethod: "manual",
      source: "manager_dashboard",
    });
    eventIds.push(event.id);
  }
  const summary =
    !input.clock_in_time && !input.clock_out_time && input.status
      ? await directSummaryUpdate(env, {
          companyId: context.companyId,
          employeeId: input.employee_id,
          outletId: input.outlet_id,
          attendanceDate: input.attendance_date,
          status: input.status,
        }).then(() => ({ attendance_date: input.attendance_date, status: input.status }))
      : await rebuildDailySummary(env, context.companyId, input.employee_id, input.attendance_date);

  if ((input.clock_in_time || input.clock_out_time) && input.status) {
    await directSummaryUpdate(env, {
      companyId: context.companyId,
      employeeId: input.employee_id,
      outletId: input.outlet_id,
      attendanceDate: input.attendance_date,
      status: input.status,
    });
  }
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id,
    module: "attendance",
    action: "attendance_manual_entry",
    entityType: "attendance_daily_summary",
    entityId: input.employee_id,
    employeeId: input.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    details: { event_ids: eventIds, notes: input.notes },
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    required: options.auditRequired ?? true,
  });
  return { event_ids: eventIds, summary };
};

export const manualBatch = async (
  env: Env,
  context: AuthActor,
  input: ManualBatchInput,
) => {
  assertOutletAccess(context, input.outlet_id);
  await assertPayrollUnlocked(env, context.companyId, input.attendance_date);

  const accepted: Array<{ index: number; employee_id: string; event_ids: string[] }> = [];
  const rowErrors: ManualBatchRowError[] = [];

  for (const [index, entry] of input.entries.entries()) {
    const employeeId = entry.employee_id?.trim();
    if (!employeeId) {
      rowErrors.push({
        index,
        code: "EMPLOYEE_REQUIRED",
        message: "Employee is required for this row.",
      });
      continue;
    }
    if (!entry.clock_in_time && !entry.clock_out_time && !entry.status) {
      rowErrors.push({
        index,
        employee_id: employeeId,
        code: "ATTENDANCE_VALUE_REQUIRED",
        message: "Add a clock time or attendance status for this row.",
      });
      continue;
    }

    try {
      const result = await manualEntry(
        env,
        context,
        {
          employee_id: employeeId,
          outlet_id: input.outlet_id,
          attendance_date: input.attendance_date,
          clock_in_time: entry.clock_in_time,
          clock_out_time: entry.clock_out_time,
          status: entry.status,
          reason: input.reason,
          notes: entry.notes ?? entry.note,
        },
        { auditRequired: false },
      );
      accepted.push({ index, employee_id: employeeId, event_ids: result.event_ids });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "This attendance row could not be saved.";
      const code = error instanceof AppError ? error.code : "ROW_NOT_SAVED";
      rowErrors.push({ index, employee_id: employeeId, code, message });
    }
  }

  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id,
    module: "attendance",
    action: "attendance_manual_batch",
    entityType: "attendance_daily_summary",
    entityId: input.outlet_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    details: {
      attendance_date: input.attendance_date,
      accepted_count: accepted.length,
      row_error_count: rowErrors.length,
    },
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    required: false,
  });

  await realtime(
    env,
    context.companyId,
    "attendance.manual_batch",
    { outlet_id: input.outlet_id, attendance_date: input.attendance_date, accepted_count: accepted.length },
    context.actorUserId,
  );

  return {
    outlet_id: input.outlet_id,
    attendance_date: input.attendance_date,
    accepted,
    row_errors: rowErrors,
  };
};

export const createCorrectionRequest = async (
  env: Env,
  context: AuthActor,
  input: CorrectionRequestInput,
) => {
  await canCreateAttendanceCorrectionForEmployee(env, context, input.employee_id);
  const employee = await ensureEmployee(env, context.companyId, input.employee_id);
  if (employee.primary_outlet_id) assertOutletAccess(context, employee.primary_outlet_id);
  assertSupportedCorrectionType(input.correction_type);
  const value = normalizeCorrectionPayload(input);
  assertSafeCorrectionPayload(value);
  await assertAttendanceEventBelongsToEmployee(env, context, {
    attendanceEventId: input.attendance_event_id ?? null,
    employeeId: input.employee_id,
  });
  const requestedDate = correctionRequestedDate(input, value);
  if (!requestedDate) throw new ValidationError("Attendance date is required for this correction.");
  await validateCorrectionApplyReadiness(env, context, {
    employee_id: input.employee_id,
    attendance_event_id: input.attendance_event_id ?? null,
    correction_type: input.correction_type,
  }, value);
  if (await repository.findDuplicatePendingCorrection(env, {
    companyId: context.companyId,
    employeeId: input.employee_id,
    correctionType: input.correction_type,
    requestedDate,
    attendanceEventId: input.attendance_event_id ?? null,
  })) {
    throw new ConflictError("A pending correction already exists for this attendance date.");
  }
  const id = createPrefixedId("att_corr");
  await repository.createCorrection(env, {
    id,
    companyId: context.companyId,
    employeeId: input.employee_id,
    outletId: input.outlet_id ?? employee.primary_outlet_id ?? null,
    attendanceEventId: input.attendance_event_id,
    correctionType: input.correction_type,
    oldValueJson: input.old_value_json ? JSON.stringify(input.old_value_json) : null,
    newValueJson: JSON.stringify(value),
    reason: input.reason,
    requestedBy: context.actorUserId,
    requestedDate,
  });
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: ATTENDANCE_CORRECTION_OPERATION,
    subject_type: ATTENDANCE_CORRECTION_SUBJECT_TYPE,
    subject_id: id,
    requester_employee_id: employee.id,
    subject_employee_id: employee.id,
    department_id: employee.department_id,
    position_id: employee.position_id,
    level: employee.level,
    title: `Attendance correction for ${employee.full_name}`,
    summary: `${input.correction_type} for ${requestedDate}`,
    payload_json: {
      correction_id: id,
      employee_id: employee.id,
      attendance_event_id: input.attendance_event_id ?? null,
      requested_date: requestedDate,
      correction_type: input.correction_type,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "attendance.corrections.createForOthers",
    moduleOperationType: ATTENDANCE_CORRECTION_OPERATION,
  });
  if (!draft) throw new ValidationError("No active attendance correction approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const mapped = await correctionStatusFromApproval(env, context.companyId, submitted?.id, "PENDING");
  await repository.updateCorrectionApprovalLink(env, context.companyId, id, {
    approvalRequestId: submitted?.id ?? draft.id,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStep: submitted?.current_step_id ?? mapped.currentStepId,
  });
  await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
    status: mapped.status,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStep: submitted?.current_step_id ?? mapped.currentStepId,
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id,
    module: "attendance",
    action: "attendance_correction_requested",
    entityType: "attendance_correction",
    entityId: id,
    employeeId: input.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    required: true,
  });
  await realtime(env, context.companyId, "attendance.correction_requested", { correction_id: id }, context.actorUserId);
  return {
    correction_id: id,
    approval_request_id: submitted?.id ?? draft.id,
    approval_status: submitted?.status ?? "IN_REVIEW",
    approval_current_step: mapped.currentStepName,
  };
};

export const approveCorrection = async (env: Env, context: AuthActor, id: string, input: ReviewInput) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  if (!["pending", "PENDING", "PENDING_DEPARTMENT_APPROVAL", "PENDING_HR_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(correction.status)) {
    throw new ConflictError("This correction has already been approved/rejected/cancelled.");
  }
  const correctionValue = parseCorrectionValue(correction.new_value_json);
  if (correction.approval_request_id) {
    const timeline = await approvalEngineService.getTimeline(env, context, correction.approval_request_id).catch(() => null);
    const currentStep = timeline?.steps.find((step) => step.id === timeline.request.current_step_id);
    const isFinalStep = currentStep?.approver_resolver_type === "HR_FINAL_APPROVER" || currentStep?.approver_resolver_type === "FINANCE_FINAL_APPROVER";
    if (isFinalStep) {
      await validateCorrectionApplyReadiness(env, context, correction, correctionValue);
    }
    const engineApproval = await approvalEngineService.approveStep(env, context, correction.approval_request_id, input.reason, { allowModuleBoundAction: true });
    const mapped = await correctionStatusFromApproval(env, context.companyId, correction.approval_request_id, "PENDING");
    if (engineApproval?.status !== "APPROVED") {
      await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
        status: mapped.status,
        approvalStatus: engineApproval?.status ?? "IN_REVIEW",
        currentStep: engineApproval?.current_step_id ?? mapped.currentStepId,
        actorId: context.actorUserId,
        departmentApproved: true,
      });
      return {
        approved: false,
        pending_final_approval: true,
        approval_status: engineApproval?.status ?? "IN_REVIEW",
        current_step: mapped.currentStepName,
      };
    }
  }
  const value = correctionValue;
  try {
  const employee = await ensureEmployee(env, context.companyId, correction.employee_id);
  const existingEvent = await assertAttendanceEventBelongsToEmployee(env, context, {
    attendanceEventId: correction.attendance_event_id,
    employeeId: correction.employee_id,
  });
  let affectedDate =
    existingEvent?.event_time.slice(0, 10) ??
    (typeof value.attendance_date === "string" ? value.attendance_date : undefined);
  const affectedOutletId = await resolveCorrectionOutletId(
    env,
    context.companyId,
    correction,
    value,
    affectedDate,
  );

  if (!affectedOutletId) {
    throw new ValidationError(
      "Unable to confirm outlet access for this attendance correction.",
    );
  }

  assertAttendanceOutletAccess(context, affectedOutletId);

  if (
    correction.correction_type === "clock_in_time" ||
    correction.correction_type === "clock_out_time"
  ) {
    const eventTime = correctionDateTime(value);
    const originalDate = existingEvent?.event_time
      ? getAttendanceDateFromEventTime(existingEvent.event_time)
      : affectedDate;
    affectedDate = eventTime.slice(0, 10);
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      originalDate ? getPayrollMonthFromAttendanceDate(originalDate) : null,
      getPayrollMonthFromAttendanceDate(affectedDate),
    ]);

    if (existingEvent) {
      await repository.updateAttendanceEvent(
        env,
        context.companyId,
        correction.employee_id,
        existingEvent.id,
        correction.correction_type === "clock_in_time" ? "clock_in" : "clock_out",
        eventTime,
      );
    } else {
      const outletId =
        typeof value.outlet_id === "string"
          ? value.outlet_id
          : affectedOutletId;

      if (!outletId) {
        throw new ValidationError("Outlet is required for this correction.");
      }

      await createEvent(env, {
        companyId: context.companyId,
        employeeId: correction.employee_id,
        outletId,
        eventType:
          correction.correction_type === "clock_in_time" ? "clock_in" : "clock_out",
        eventTime,
        attendanceMethod: "manual",
        source: "admin_dashboard",
      });
    }

    await rebuildDailySummary(
      env,
      context.companyId,
      correction.employee_id,
      affectedDate,
    );
  } else if (correction.correction_type === "status") {
    if (
      typeof value.attendance_date !== "string" ||
      typeof value.outlet_id !== "string" ||
      typeof value.status !== "string"
    ) {
      throw new ValidationError("Please provide a valid attendance status correction.");
    }
    const originalDate = affectedDate;
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      originalDate ? getPayrollMonthFromAttendanceDate(originalDate) : null,
      getPayrollMonthFromAttendanceDate(value.attendance_date),
    ]);
    await directSummaryUpdate(env, {
      companyId: context.companyId,
      employeeId: correction.employee_id,
      outletId: value.outlet_id,
      attendanceDate: value.attendance_date,
      status: assertValidSummaryStatus(value.status),
    });
    affectedDate = value.attendance_date;
  } else if (correction.correction_type === "manual_summary_update") {
    if (
      typeof value.attendance_date !== "string" ||
      typeof value.outlet_id !== "string" ||
      typeof value.status !== "string"
    ) {
      throw new ValidationError("Please provide valid summary details.");
    }
    const originalDate = affectedDate;
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      originalDate ? getPayrollMonthFromAttendanceDate(originalDate) : null,
      getPayrollMonthFromAttendanceDate(value.attendance_date),
    ]);
    await directSummaryUpdate(env, {
      companyId: context.companyId,
      employeeId: correction.employee_id,
      outletId: value.outlet_id,
      attendanceDate: value.attendance_date,
      firstClockIn:
        typeof value.first_clock_in === "string" ? value.first_clock_in : null,
      lastClockOut:
        typeof value.last_clock_out === "string" ? value.last_clock_out : null,
      workedMinutes:
        typeof value.worked_minutes === "number" ? value.worked_minutes : 0,
      status: assertValidSummaryStatus(value.status),
    });
    affectedDate = value.attendance_date;
  } else {
    throw new AppError(
      "This correction type is not supported yet.",
      "UNSUPPORTED_CORRECTION_TYPE",
      400,
    );
  }

  await repository.updateCorrectionStatus(env, context.companyId, id, "approved", context.actorUserId);
  await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
    status: "approved",
    approvalStatus: "APPROVED",
    currentStep: null,
    actorId: context.actorUserId,
    hrApproved: true,
    applied: true,
  });
  await audit(env, {
    companyId: context.companyId,
    module: "attendance",
    action: "attendance_correction_approved",
    entityType: "attendance_correction",
    entityId: id,
    employeeId: correction.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    details: { affected_date: affectedDate },
    required: true,
  });
  await realtime(env, context.companyId, "attendance.correction_approved", { correction_id: id }, context.actorUserId);
  return { approved: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attendance correction could not be applied after final approval.";
    await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
      status: "FAILED_TO_APPLY",
      approvalStatus: "APPROVED",
      currentStep: null,
      actorId: context.actorUserId,
      reason: message,
    });
    await audit(env, {
      companyId: context.companyId,
      module: "attendance",
      action: "attendance_correction_apply_failed",
      entityType: "attendance_correction",
      entityId: id,
      employeeId: correction.employee_id,
      actorUserId: context.actorUserId,
      reason: message,
      details: { approval_request_id: correction.approval_request_id ?? null },
      required: true,
    });
    throw error;
  }
};

export const rejectCorrection = async (env: Env, context: AuthActor, id: string, input: ReviewInput) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  if (!["pending", "PENDING", "PENDING_DEPARTMENT_APPROVAL", "PENDING_HR_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(correction.status)) {
    throw new ConflictError("This correction has already been approved/rejected/cancelled.");
  }
  if (correction.approval_request_id) {
    const engineApproval = await approvalEngineService.rejectStep(env, context, correction.approval_request_id, input.reason, input.reason, { allowModuleBoundAction: true });
    await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
      status: "rejected",
      approvalStatus: engineApproval?.status ?? "REJECTED",
      currentStep: null,
      actorId: context.actorUserId,
      reason: input.reason,
      rejected: true,
    });
  } else {
    await repository.updateCorrectionStatus(env, context.companyId, id, "rejected", context.actorUserId);
  }
  await audit(env, {
    companyId: context.companyId,
    module: "attendance",
    action: "attendance_correction_rejected",
    entityType: "attendance_correction",
    entityId: id,
    employeeId: correction.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    required: true,
  });
  return { rejected: true };
};

export const canViewAttendanceCorrection = async (env: Env, context: AuthActor, correction: any) => {
  if (
    permissionService.isSuperAdmin(context) ||
    (context.isAdmin && permissionService.hasAnyPermission(context, ["attendance.view", "attendance.corrections.view", "attendance.corrections.audit.view", "attendance.corrections.createForOthers"]))
  ) return true;
  if (correction.requested_by === context.actorUserId) return true;
  const linked = await actorLinkedEmployee(env, context);
  if (linked?.id && linked.id === correction.employee_id) return true;
  if (correction.approval_request_id && permissionService.hasAnyPermission(context, [
    "approvals.department.view",
    "approvals.department.approve",
    "approvals.department.reject",
    "approvals.hrFinal.view",
    "approvals.hrFinal.approve",
    "approvals.hrFinal.reject",
  ])) {
    await approvalEngineService.getTimeline(env, context, correction.approval_request_id);
    return true;
  }
  throw new PermissionError("You do not have access to this attendance correction.");
};

export const buildAttendanceCorrectionVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (
    permissionService.isSuperAdmin(context) ||
    (context.isAdmin && permissionService.hasAnyPermission(context, ["attendance.view", "attendance.corrections.view", "attendance.corrections.audit.view", "attendance.corrections.createForOthers"]))
  ) {
    return { extra: undefined, values: [] as unknown[] };
  }

  const clauses = ["c.requested_by = ?"];
  const values: unknown[] = [context.actorUserId];
  const linked = await actorLinkedEmployee(env, context);
  if (linked?.id) {
    clauses.push("c.employee_id = ?");
    values.push(linked.id);
  }
  if (linked?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"])) {
    clauses.push(`(e.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = c.company_id
         AND s.approval_request_id = c.approval_request_id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.assigned_approver_user_id IS NULL OR s.assigned_approver_user_id = ?)
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(linked.department_id, context.actorUserId, linked.level ?? 0, linked.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["approvals.hrFinal.view", "approvals.hrFinal.approve", "approvals.hrFinal.reject"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = c.company_id
         AND s.approval_request_id = c.approval_request_id
         AND s.approver_resolver_type = 'HR_FINAL_APPROVER'
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  return { extra: `(${clauses.join(" OR ")})`, values };
};

export const cancelCorrection = async (env: Env, context: AuthActor, id: string, input: ReviewInput) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  if (!["pending", "PENDING", "PENDING_DEPARTMENT_APPROVAL", "PENDING_HR_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(correction.status)) {
    throw new ConflictError("This correction request has already been approved/rejected/cancelled.");
  }
  const linked = await actorLinkedEmployee(env, context);
  const isRequester = correction.requested_by === context.actorUserId || linked?.id === correction.employee_id;
  if (!isRequester && !permissionService.isSuperAdmin(context) && !permissionService.hasPermission(context, "attendance.corrections.cancelAny")) {
    throw new PermissionError("You cannot cancel another employee's attendance correction.");
  }
  if (correction.approval_request_id) {
    await approvalEngineService.cancelRequest(env, context, correction.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "attendance.corrections.cancel",
      moduleCancelAnyPermission: "attendance.corrections.cancelAny",
      moduleOperationType: ATTENDANCE_CORRECTION_OPERATION,
    });
  }
  await repository.updateCorrectionApprovalStatus(env, context.companyId, id, {
    status: "cancelled",
    approvalStatus: "CANCELLED",
    currentStep: null,
    actorId: context.actorUserId,
    reason: input.reason,
    cancelled: true,
  });
  await audit(env, {
    companyId: context.companyId,
    module: "attendance",
    action: "attendance_correction_cancelled",
    entityType: "attendance_correction",
    entityId: id,
    employeeId: correction.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    required: true,
  });
  return { cancelled: true };
};

export const getCorrectionApprovalTimeline = async (env: Env, context: AuthActor, id: string) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  await canViewAttendanceCorrection(env, context, correction);
  if (!correction.approval_request_id) {
    return { correction, request: null, steps: [], actions: [] };
  }
  const timeline = await approvalEngineService.getTimeline(env, context, correction.approval_request_id);
  return { correction, ...timeline };
};

export const getCorrection = async (env: Env, context: AuthActor, id: string) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  await canViewAttendanceCorrection(env, context, correction);
  return correction;
};

export const listCorrections = async (env: Env, context: AuthActor, filters: any) => {
  const visibility = await buildAttendanceCorrectionVisibilityFilter(env, context);
  const [total, rows] = await Promise.all([
    repository.countCorrections(env, context.companyId, filters, outletScope(context), visibility.extra, visibility.values),
    repository.listCorrections(env, context.companyId, filters, outletScope(context), visibility.extra, visibility.values),
  ]);
  return {
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    } satisfies PaginationMeta,
  };
};

export const listConflicts = (env: Env, context: AuthActor, filters: any) =>
  Promise.all([
    repository.countConflicts(env, context.companyId, filters, outletScope(context)),
    repository.listConflicts(env, context.companyId, filters, outletScope(context)),
  ]).then(([total, rows]) => ({
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    } satisfies PaginationMeta,
  }));

export const resolveConflict = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: ConflictResolveInput,
) => {
  const conflict = await repository.findConflictById(env, context.companyId, id);
  if (!conflict) throw new NotFoundError("The requested attendance conflict could not be found.");
  if (!["pending", "open"].includes(conflict.status)) throw new ConflictError("This conflict has already been resolved.");
  const outletId = await resolveConflictOutletId(env, context.companyId, conflict);
  if (!outletId) {
    throw new ValidationError(
      "Unable to confirm outlet access for this attendance conflict.",
    );
  }
  assertAttendanceOutletAccess(context, outletId);
  await repository.resolveConflict(env, context.companyId, id, context.actorUserId, input.reason);
  await audit(env, {
    companyId: context.companyId,
    outletId: conflict.outlet_id,
    module: "attendance",
    action: "attendance_conflict_resolved",
    entityType: "attendance_conflict",
    entityId: id,
    employeeId: conflict.employee_id,
    actorUserId: context.actorUserId,
    reason: input.reason,
    details: { resolution: input.resolution },
    required: true,
  });
  await realtime(env, context.companyId, "attendance.conflict_resolved", { conflict_id: id }, context.actorUserId);
  return { resolved: true };
};

export const listMissingPunches = (env: Env, context: AuthActor, filters: any) =>
  Promise.all([
    repository.countMissingPunches(env, context.companyId, filters, outletScope(context)),
    repository.listMissingPunches(env, context.companyId, filters, outletScope(context)),
  ]).then(([total, rows]) => ({
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    } satisfies PaginationMeta,
  }));

export const getEventDetail = async (
  env: Env,
  context: AuthActor,
  id: string,
) => {
  const event = await repository.findEventDetailById(env, context.companyId, id);
  if (!event) throw new NotFoundError("Attendance event not found.");
  if (!permissionService.hasOutletAccess(context, event.outlet_id)) {
    throw new OutletAccessError("You do not have access to this attendance record.");
  }
  return {
    id: event.id,
    employee_id: event.employee_id,
    employee_code: event.employee_code,
    employee_name: event.employee_name,
    outlet_id: event.outlet_id,
    outlet_name: event.outlet_name,
    event_type: event.event_type,
    event_time: event.event_time,
    attendance_method: event.attendance_method,
    source: event.source,
    device_id: event.device_id,
    created_offline: event.created_offline,
    sync_status: event.sync_status,
    approval_status: event.approval_status,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
};

export const kioskClock = async (
  env: Env,
  device: DeviceAuthContext,
  input: KioskClockInput,
  eventType: "clock_in" | "clock_out",
) => {
  if (!device.outletId) throw new OutletAccessError("This device is not assigned to an outlet.");
  const employee = await ensureEmployee(env, device.companyId, input.employee_id);
  const eventTime = input.event_time ?? nowIso();
  const attendanceDate = dateOf(eventTime);
  const existing = await findExistingLocalEvent(env, device.companyId, device.deviceId, input.local_id);
  if (existing) return { event_id: existing.id, duplicate_local_id: true };
  if (employee.primary_outlet_id !== device.outletId) {
    const conflict = await createAttendanceConflict(env, {
      companyId: device.companyId,
      employeeId: input.employee_id,
      outletId: device.outletId,
      deviceId: device.deviceId,
      conflictType: "wrong_outlet",
      localPayload: input as unknown as Record<string, unknown>,
      audit: {
        module: "kiosk",
        device,
        required: false,
      },
    });
    return { conflict_created: true, conflict_type: "wrong_outlet", conflict_id: conflict.id };
  }
  await assertNoDuplicatePunch(env, device.companyId, input.employee_id, attendanceDate, eventType);
  if (eventType === "clock_out" && !(await hasClockInForDate(env, device.companyId, input.employee_id, attendanceDate))) {
    const conflict = await createAttendanceConflict(env, {
      companyId: device.companyId,
      employeeId: input.employee_id,
      outletId: device.outletId,
      deviceId: device.deviceId,
      conflictType: "missing_clock_in",
      localPayload: input as unknown as Record<string, unknown>,
      audit: {
        module: "kiosk",
        device,
        required: false,
      },
    });
    return { conflict_created: true, conflict_type: "missing_clock_in", conflict_id: conflict.id };
  }
  const event = await createEvent(env, {
    companyId: device.companyId,
    employeeId: input.employee_id,
    outletId: device.outletId,
    deviceId: device.deviceId,
    eventType,
    eventTime,
    attendanceMethod: input.attendance_method ?? "kiosk",
    source: "kiosk",
    localId: input.local_id,
  });
  const summary = await rebuildDailySummary(env, device.companyId, input.employee_id, attendanceDate);
  await audit(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    module: "kiosk",
    action: eventType === "clock_in" ? "kiosk_clock_in" : "kiosk_clock_out",
    entityType: "attendance_event",
    entityId: event.id,
    employeeId: input.employee_id,
    deviceId: device.deviceId,
    requestId: device.requestId,
  });
  await realtime(env, device.companyId, eventType === "clock_in" ? "kiosk.clock_in" : "kiosk.clock_out", { event_id: event.id }, device.deviceId);
  return { event_id: event.id, summary };
};
