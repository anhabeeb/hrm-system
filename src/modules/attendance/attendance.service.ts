import * as repository from "./attendance.repository";
import { rebuildDailySummary } from "./attendance-summary.service";
import { createAttendanceConflict } from "./attendance-conflict.service";
import { ATTENDANCE_SUMMARY_STATUSES } from "./attendance.constants";
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
  ManualEntryInput,
  ReviewInput,
} from "./attendance.types";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, DeviceAuthContext, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  ConflictError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const dateOf = (value: string) => value.slice(0, 10);
const MALDIVES_OFFSET = "+05:00";

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
  if (run?.status === "locked" || run?.status === "paid") {
    throw new LockedRecordError(
      "This attendance period is locked because payroll is locked.",
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
    if (run?.status === "locked" || run?.status === "paid") {
      throw new LockedRecordError(
        "This attendance period is locked because payroll is locked.",
      );
    }
  }
};

const ensureEmployee = async (env: Env, companyId: string, employeeId: string) => {
  const employee = await repository.findEmployeeForAttendance(env, companyId, employeeId);
  if (!employee || employee.deleted_at) {
    throw new NotFoundError("The requested employee could not be found.");
  }
  if (["archived", "resigned", "terminated"].includes(employee.employment_status)) {
    throw new ValidationError("This employee is not active for attendance.");
  }
  return employee;
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
    payroll_status:
      payrollRun?.status === "locked" || payrollRun?.status === "paid"
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
) => {
  assertOutletAccess(context, input.outlet_id);
  await ensureEmployee(env, context.companyId, input.employee_id);
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
    required: true,
  });
  return { event_ids: eventIds, summary };
};

export const createCorrectionRequest = async (
  env: Env,
  context: AuthActor,
  input: CorrectionRequestInput,
) => {
  const employee = await ensureEmployee(env, context.companyId, input.employee_id);
  if (employee.primary_outlet_id) assertOutletAccess(context, employee.primary_outlet_id);
  const id = createPrefixedId("att_corr");
  await repository.createCorrection(env, {
    id,
    companyId: context.companyId,
    employeeId: input.employee_id,
    attendanceEventId: input.attendance_event_id,
    correctionType: input.correction_type,
    oldValueJson: input.old_value_json ? JSON.stringify(input.old_value_json) : null,
    newValueJson: JSON.stringify(input.new_value_json),
    reason: input.reason,
    requestedBy: context.actorUserId,
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
  return { correction_id: id };
};

export const approveCorrection = async (env: Env, context: AuthActor, id: string, input: ReviewInput) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  if (correction.status !== "pending") throw new ConflictError("This correction has already been reviewed.");
  const value = parseCorrectionValue(correction.new_value_json);
  const employee = await ensureEmployee(env, context.companyId, correction.employee_id);
  const existingEvent = correction.attendance_event_id
    ? await repository.findEventById(
        env,
        context.companyId,
        correction.attendance_event_id,
      )
    : null;
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
};

export const rejectCorrection = async (env: Env, context: AuthActor, id: string, input: ReviewInput) => {
  const correction = await repository.findCorrectionById(env, context.companyId, id);
  if (!correction) throw new NotFoundError("The requested attendance correction could not be found.");
  if (correction.status !== "pending") throw new ConflictError("This correction has already been reviewed.");
  await repository.updateCorrectionStatus(env, context.companyId, id, "rejected", context.actorUserId);
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

export const listCorrections = (env: Env, context: AuthActor, filters: any) =>
  Promise.all([
    repository.countCorrections(env, context.companyId, filters, outletScope(context)),
    repository.listCorrections(env, context.companyId, filters, outletScope(context)),
  ]).then(([total, rows]) => ({
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    } satisfies PaginationMeta,
  }));

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
  if (conflict.status !== "pending") throw new ConflictError("This conflict has already been resolved.");
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
