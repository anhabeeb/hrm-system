import * as attendanceRepository from "../attendance/attendance.repository";
import { rebuildDailySummary } from "../attendance/attendance-summary.service";
import {
  assertPayrollMonthsUnlocked,
  getAttendanceDateFromEventTime,
  getPayrollMonthFromAttendanceDate,
} from "../attendance/attendance.service";
import * as devicesRepository from "../devices/devices.repository";
import * as settingsService from "../../services/settings.service";
import * as repository from "./sync.repository";
import { createSyncChange, getLatestSyncToken } from "./sync-change.service";
import { createSyncConflict } from "./sync-conflict.service";
import { findExistingOfflineAttendanceEvent } from "./sync-dedupe.service";
import {
  DEFAULT_MAX_RECORDS_PER_BATCH,
  DEVICE_TIME_CONFLICT_MINUTES,
  SYNC_ACTION_TYPES,
  SYNC_ENTITY_TYPES,
} from "./sync.constants";
import type {
  SyncConflictResolveInput,
  SyncForceResyncInput,
  SyncListFilters,
  SyncOutletScope,
  SyncPullQuery,
  SyncPushEventInput,
  SyncPushInput,
  SyncRetryInput,
} from "./sync.types";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, DeviceAuthContext, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  DeviceAuthError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const attendanceDate = (eventTime: string) => eventTime.slice(0, 10);

const scope = (context: AuthActor): SyncOutletScope => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (outletId && !permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this outlet.");
  }
};

const assertDeviceOutlet = (device: DeviceAuthContext, outletId?: string | null) => {
  if (!device.outletId) {
    throw new DeviceAuthError("This device is not allowed to access this outlet.", "DEVICE_OUTLET_DENIED");
  }
  if (outletId && outletId !== device.outletId) {
    throw new DeviceAuthError("This device is not allowed to access this outlet.", "DEVICE_OUTLET_DENIED");
  }
};

const audit = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    module?: "sync" | "devices";
    action: string;
    entityType: string;
    entityId: string;
    employeeId?: string | null;
    actor?: AuthActor;
    device?: DeviceAuthContext;
    reason?: string;
    details?: Record<string, unknown>;
    required?: boolean;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: input.companyId,
    outletId: input.outletId ?? undefined,
    module: input.module ?? "sync",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId ?? undefined,
    actorId: input.actor?.actorUserId,
    deviceId: input.device?.deviceId,
    reason: input.reason,
    details: input.details,
    requestId: input.actor?.requestId ?? input.device?.requestId,
    ipAddress: input.actor?.ipAddress,
    userAgent: input.actor?.userAgent,
  });

  if (!result.created && input.required) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

const isSupported = (event: SyncPushEventInput) =>
  (SYNC_ENTITY_TYPES as readonly string[]).includes(event.entity_type) &&
  (SYNC_ACTION_TYPES as readonly string[]).includes(event.action_type) &&
  event.action_type !== "manual_entry_placeholder";

const hasDuplicatePunch = async (
  env: Env,
  companyId: string,
  employeeId: string,
  date: string,
  eventType: "clock_in" | "clock_out",
) => {
  const events = await attendanceRepository.listEventsForDate(env, companyId, employeeId, date);
  return events.some((event) => event.event_type === eventType);
};

const shouldCreateDeviceTimeConflict = (eventTime: string, createdOffline?: boolean) => {
  if (createdOffline) return false;
  const parsed = new Date(eventTime);
  if (Number.isNaN(parsed.getTime())) return true;
  const diffMinutes = Math.abs(Date.now() - parsed.getTime()) / 60000;
  return diffMinutes > DEVICE_TIME_CONFLICT_MINUTES;
};

const createAcceptedAttendanceEvent = async (
  env: Env,
  device: DeviceAuthContext,
  outletId: string,
  event: SyncPushEventInput,
) => {
  const id = createPrefixedId("att");
  await attendanceRepository.createAttendanceEvent(env, {
    id,
    company_id: device.companyId,
    employee_id: event.employee_id,
    outlet_id: outletId,
    device_id: device.deviceId,
    event_type: event.action_type === "clock_in" ? "clock_in" : "clock_out",
    event_time: event.event_time,
    attendance_method: event.attendance_method ?? "kiosk",
    source: "kiosk",
    local_id: event.local_id,
    created_offline: event.created_offline ? 1 : 0,
    sync_status: "synced",
    approval_status: "approved",
  });
  await rebuildDailySummary(env, device.companyId, event.employee_id, attendanceDate(event.event_time));
  const changeVersion = await createSyncChange(env, {
    companyId: device.companyId,
    outletId,
    entityType: "attendance",
    entityId: id,
    actionType: event.action_type,
    changedBy: device.deviceId,
    payload: {
      employee_id: event.employee_id,
      event_type: event.action_type,
      event_time: event.event_time,
    },
  });
  await createSyncChange(env, {
    companyId: device.companyId,
    outletId,
    entityType: "attendance_summary",
    entityId: event.employee_id,
    actionType: "summary_updated",
    changedBy: device.deviceId,
    payload: {
      employee_id: event.employee_id,
      attendance_date: attendanceDate(event.event_time),
    },
  });
  await audit(env, {
    companyId: device.companyId,
    outletId,
    action: "sync_item_accepted",
    entityType: "attendance_event",
    entityId: id,
    employeeId: event.employee_id,
    device,
    details: { local_id: event.local_id },
  });
  return { id, changeVersion };
};

const processPushEvent = async (
  env: Env,
  device: DeviceAuthContext,
  batchRowId: string,
  outletId: string,
  event: SyncPushEventInput,
) => {
  const syncItemId = createPrefixedId("sync_item");
  await repository.createSyncItem(env, {
    id: syncItemId,
    companyId: device.companyId,
    outletId,
    deviceId: device.deviceId,
    batchRowId,
    localId: event.local_id,
    entityType: event.entity_type,
    actionType: event.action_type,
    payloadJson: JSON.stringify(event),
    createdOfflineAt: event.event_time,
  });

  if (!isSupported(event)) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: event.entity_type,
      localId: event.local_id,
      conflictType: "unsupported_item",
      localPayload: event as unknown as Record<string, unknown>,
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  const parsedTime = new Date(event.event_time);
  if (Number.isNaN(parsedTime.getTime())) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "invalid_payload",
      localPayload: event as unknown as Record<string, unknown>,
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  const existing = await findExistingOfflineAttendanceEvent(env, device.companyId, device.deviceId, event.local_id);
  if (existing) {
    await repository.updateSyncItemResult(env, syncItemId, "deduped", existing.id);
    return { kind: "deduped" as const, local_id: event.local_id, server_id: existing.id };
  }

  const employee = await attendanceRepository.findEmployeeForAttendance(env, device.companyId, event.employee_id);
  if (!employee || employee.deleted_at) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "missing_employee",
      localPayload: event as unknown as Record<string, unknown>,
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  if (["archived", "resigned", "terminated"].includes(employee.employment_status)) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "inactive_employee",
      localPayload: event as unknown as Record<string, unknown>,
      serverPayload: { employment_status: employee.employment_status },
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  if (employee.primary_outlet_id !== outletId) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "wrong_outlet",
      localPayload: event as unknown as Record<string, unknown>,
      serverPayload: { primary_outlet_id: employee.primary_outlet_id },
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  try {
    await assertPayrollMonthsUnlocked(env, device.companyId, [
      getPayrollMonthFromAttendanceDate(getAttendanceDateFromEventTime(event.event_time)),
    ]);
  } catch (error) {
    if (error instanceof LockedRecordError) {
      const conflict = await createSyncConflict(env, {
        companyId: device.companyId,
        outletId,
        device,
        employeeId: event.employee_id,
        entityType: "attendance",
        localId: event.local_id,
        conflictType: "payroll_locked",
        localPayload: event as unknown as Record<string, unknown>,
      });
      await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
      return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
    }
    throw error;
  }

  if (shouldCreateDeviceTimeConflict(event.event_time, event.created_offline)) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "device_time_warning",
      localPayload: event as unknown as Record<string, unknown>,
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  const duplicate = await hasDuplicatePunch(
    env,
    device.companyId,
    event.employee_id,
    attendanceDate(event.event_time),
    event.action_type === "clock_in" ? "clock_in" : "clock_out",
  );
  if (duplicate) {
    const conflict = await createSyncConflict(env, {
      companyId: device.companyId,
      outletId,
      device,
      employeeId: event.employee_id,
      entityType: "attendance",
      localId: event.local_id,
      conflictType: "duplicate_punch",
      localPayload: event as unknown as Record<string, unknown>,
    });
    await repository.updateSyncItemResult(env, syncItemId, "conflict", null, conflict.message);
    return { kind: "conflict" as const, local_id: event.local_id, conflict_id: conflict.id, conflict_type: conflict.conflict_type };
  }

  const accepted = await createAcceptedAttendanceEvent(env, device, outletId, event);
  await repository.updateSyncItemResult(env, syncItemId, "accepted", accepted.id);
  return { kind: "accepted" as const, local_id: event.local_id, server_id: accepted.id, sync_token: accepted.changeVersion };
};

export const getMaxRecordsPerBatch = async (env: Env, companyId: string) => {
  const settings = await settingsService.getSyncSettings(env, companyId).catch(() => ({}));
  const value = (settings as Record<string, unknown>).max_records_per_batch;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_RECORDS_PER_BATCH;
};

export const push = async (
  env: Env,
  device: DeviceAuthContext,
  input: SyncPushInput,
) => {
  const outletId = input.outlet_id ?? device.outletId;
  assertDeviceOutlet(device, outletId);
  const safeOutletId = outletId!;
  const existingBatch = await repository.findBatchByClientId(
    env,
    device.companyId,
    device.deviceId,
    input.batch_id,
  );
  if (existingBatch) {
    return {
      batch_id: input.batch_id,
      accepted: [],
      deduped: [],
      rejected: [],
      conflicts: [],
      duplicate_batch: true,
      new_sync_token: await getLatestSyncToken(env, device.companyId),
    };
  }

  const batchRowId = createPrefixedId("sync_batch");
  await repository.createBatch(env, {
    id: batchRowId,
    companyId: device.companyId,
    outletId: safeOutletId,
    deviceId: device.deviceId,
    batchId: input.batch_id,
    eventCount: input.events.length,
  });
  await audit(env, {
    companyId: device.companyId,
    outletId: safeOutletId,
    action: "sync_batch_received",
    entityType: "sync_batch",
    entityId: batchRowId,
    device,
    details: { batch_id: input.batch_id, event_count: input.events.length },
  });

  const accepted: Array<Record<string, unknown>> = [];
  const deduped: Array<Record<string, unknown>> = [];
  const rejected: Array<Record<string, unknown>> = [];
  const conflicts: Array<Record<string, unknown>> = [];

  for (const event of input.events) {
    try {
      const result = await processPushEvent(env, device, batchRowId, safeOutletId, event);
      if (result.kind === "accepted") accepted.push({ local_id: result.local_id, server_id: result.server_id });
      if (result.kind === "deduped") deduped.push({ local_id: result.local_id, server_id: result.server_id });
      if (result.kind === "conflict") conflicts.push({
        local_id: result.local_id,
        conflict_id: result.conflict_id,
        conflict_type: result.conflict_type,
      });
    } catch (error) {
      rejected.push({
        local_id: event.local_id,
        error: error instanceof Error ? error.message : "This offline record could not be processed.",
      });
    }
  }

  const status =
    rejected.length > 0 ? "failed" : conflicts.length > 0 ? "partial_conflict" : "completed";
  await repository.updateBatchResult(
    env,
    batchRowId,
    accepted.length + deduped.length,
    rejected.length,
    conflicts.length,
    status,
  );
  const newSyncToken = await getLatestSyncToken(env, device.companyId);
  await repository.upsertDeviceSyncState(env, {
    id: createPrefixedId("dev_state"),
    companyId: device.companyId,
    outletId: safeOutletId,
    deviceId: device.deviceId,
    lastPushAt: nowIso(),
    lastSyncToken: newSyncToken,
    pendingCount: 0,
    failedCount: rejected.length,
    conflictCount: conflicts.length,
  });
  await devicesRepository.touchDevice(env, device.deviceId).catch(() => undefined);
  await broadcastEvent(env, {
    roomName: `company:${device.companyId}`,
    type: conflicts.length > 0 ? "sync.conflict_created" : "sync.completed",
    payload: { batch_id: input.batch_id, device_id: device.deviceId },
    triggeredBy: device.deviceId,
  }).catch(() => undefined);

  return {
    batch_id: input.batch_id,
    accepted,
    deduped,
    rejected,
    conflicts,
    new_sync_token: newSyncToken,
  };
};

export const pull = async (
  env: Env,
  device: DeviceAuthContext,
  query: SyncPullQuery,
) => {
  const outletId = query.outlet_id ?? device.outletId;
  assertDeviceOutlet(device, outletId);
  const safeOutletId = outletId!;
  const changes = await repository.listPullChanges(env, device.companyId, safeOutletId, query.since);
  const token = await getLatestSyncToken(env, device.companyId);
  await repository.upsertDeviceSyncState(env, {
    id: createPrefixedId("dev_state"),
    companyId: device.companyId,
    outletId: safeOutletId,
    deviceId: device.deviceId,
    lastPullAt: nowIso(),
    lastSyncToken: token,
  });

  const initialHydration = query.since === 0;

  return {
    sync_token: token,
    changes: {
      employees: query.include.includes("employees")
        ? initialHydration
          ? await repository.listSafeEmployeesForOutlet(env, device.companyId, safeOutletId)
          : await repository.listChangedEmployeesForOutlet(env, device.companyId, safeOutletId, query.since)
        : [],
      attendance: query.include.includes("attendance")
        ? await repository.listChangedAttendanceForOutlet(env, device.companyId, safeOutletId, query.since)
        : [],
      settings: query.include.includes("settings")
        ? initialHydration || changes.some((change) => change.entity_type === "settings")
          ? await settingsService.getSyncSettings(env, device.companyId).catch(() => ({}))
          : {}
        : {},
    },
  };
};

export const status = async (
  env: Env,
  context: AuthActor,
  filters: SyncListFilters,
) => {
  const row = await repository.getSyncStatus(env, context.companyId, filters, scope(context));
  return {
    pending_count: row?.pending_count ?? 0,
    failed_count: row?.failed_count ?? 0,
    conflict_count: row?.conflict_count ?? 0,
    last_push_at: row?.last_push_at ?? null,
    last_pull_at: row?.last_pull_at ?? null,
    last_sync_token: row?.last_sync_token ?? 0,
  };
};

export const retry = async (
  env: Env,
  context: AuthActor,
  input: SyncRetryInput,
) => {
  if (input.sync_item_id) {
    const item = await repository.findSyncItem(env, context.companyId, input.sync_item_id);
    if (!item) throw new NotFoundError("Sync item not found.");
    assertOutletAccess(context, item.outlet_id);
    await repository.updateSyncItemResult(env, input.sync_item_id, "pending", item.server_entity_id, null);
  }
  await audit(env, {
    companyId: context.companyId,
    outletId: undefined,
    action: "sync_retry_requested",
    entityType: input.sync_item_id ? "sync_item" : "sync_batch",
    entityId: input.sync_item_id ?? input.batch_id!,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return { retry_requested: true };
};

export const forceResync = async (
  env: Env,
  context: AuthActor,
  input: SyncForceResyncInput,
) => {
  const device = await devicesRepository.findDeviceById(env, context.companyId, input.device_id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, input.outlet_id ?? device.outlet_id);
  await repository.resetDeviceSyncToken(env, context.companyId, input.device_id);
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id ?? device.outlet_id,
    action: "sync_force_resync_requested",
    entityType: "device",
    entityId: input.device_id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  await broadcastEvent(env, {
    roomName: `device:${input.device_id}`,
    type: "sync.force_resync_requested",
    payload: { device_id: input.device_id },
    triggeredBy: context.actorUserId,
  }).catch(() => undefined);
  return { force_resync_requested: true };
};

export const listConflicts = async (
  env: Env,
  context: AuthActor,
  filters: SyncListFilters,
) => {
  const [total, rows] = await Promise.all([
    repository.countConflicts(env, context.companyId, filters, scope(context)),
    repository.listConflicts(env, context.companyId, filters, scope(context)),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const getConflict = async (env: Env, context: AuthActor, id: string) => {
  const conflict = await repository.findConflictById(env, context.companyId, id);
  if (!conflict) throw new NotFoundError("Sync conflict not found.");
  assertOutletAccess(context, conflict.outlet_id);
  return conflict;
};

export const resolveConflict = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: SyncConflictResolveInput,
) => {
  const conflict = await getConflict(env, context, id);
  if (conflict.status !== "pending") {
    throw new AppError("This sync conflict has already been reviewed.", "CONFLICT", 409);
  }
  if (["accept", "merge"].includes(input.resolution) && conflict.entity_type === "attendance") {
    const payload = conflict.local_payload_json ? JSON.parse(conflict.local_payload_json) as SyncPushEventInput : null;
    if (!payload) throw new ValidationError("This sync conflict cannot be applied safely.");
    await assertPayrollMonthsUnlocked(env, context.companyId, [
      getPayrollMonthFromAttendanceDate(getAttendanceDateFromEventTime(payload.event_time)),
    ]);
    if (!conflict.outlet_id) throw new ValidationError("Unable to confirm outlet access for this sync conflict.");
    await createAcceptedAttendanceEvent(
      env,
      {
        requestId: context.requestId ?? "",
        companyId: context.companyId,
        deviceId: conflict.device_id ?? "sync_review",
        outletId: conflict.outlet_id,
        deviceType: "local_bridge",
      },
      conflict.outlet_id,
      payload,
    );
  }
  const status = input.resolution === "reject" ? "rejected" : input.resolution === "ignore" ? "ignored" : "resolved";
  await repository.resolveConflict(env, context.companyId, id, context.actorUserId, status, input.reason);
  await audit(env, {
    companyId: context.companyId,
    outletId: conflict.outlet_id,
    action: "sync_conflict_resolved",
    entityType: "sync_conflict",
    entityId: id,
    employeeId: conflict.employee_id,
    actor: context,
    reason: input.reason,
    details: { resolution: input.resolution },
    required: true,
  });
  return { resolved: true };
};

export const listBatches = async (
  env: Env,
  context: AuthActor,
  filters: SyncListFilters,
) => {
  const [total, rows] = await Promise.all([
    repository.countBatches(env, context.companyId, filters, scope(context)),
    repository.listBatches(env, context.companyId, filters, scope(context)),
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

export const getBatch = async (env: Env, context: AuthActor, id: string) => {
  const batch = await repository.findBatchById(env, context.companyId, id);
  if (!batch) throw new NotFoundError("Sync batch not found.");
  assertOutletAccess(context, batch.outlet_id);
  return {
    batch,
    items: await repository.listBatchItems(env, context.companyId, batch.id),
  };
};

export const health = (env: Env, context: AuthActor, filters: SyncListFilters) =>
  devicesRepository.healthSummary(env, context.companyId, {
    outlet_id: filters.outlet_id,
    device_type: undefined,
    status: undefined,
    search: undefined,
    page: filters.page,
    page_size: filters.page_size,
  }, scope(context));

export const getPayrollSyncBlockers = (
  env: Env,
  companyId: string,
  payrollMonth: string,
  outletId?: string,
) => payrollSyncBlockers(env, companyId, payrollMonth, outletId);

const parsePayload = (value: string | null | undefined): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const payloadMonth = (payload: Record<string, unknown> | null): string | null => {
  const eventTime = payload?.event_time;
  if (typeof eventTime === "string" && /^\d{4}-\d{2}/.test(eventTime)) {
    return eventTime.slice(0, 7);
  }
  const attendanceDate = payload?.attendance_date;
  if (typeof attendanceDate === "string" && /^\d{4}-\d{2}/.test(attendanceDate)) {
    return attendanceDate.slice(0, 7);
  }
  return null;
};

const blockerItemMonth = (item: {
  created_offline_at: string | null;
  payload_json: string | null;
}) => {
  if (item.created_offline_at && /^\d{4}-\d{2}/.test(item.created_offline_at)) {
    return item.created_offline_at.slice(0, 7);
  }
  return payloadMonth(parsePayload(item.payload_json));
};

const blockerConflictMonth = (conflict: {
  local_payload_json: string | null;
  server_payload_json: string | null;
}) =>
  payloadMonth(parsePayload(conflict.local_payload_json)) ??
  payloadMonth(parsePayload(conflict.server_payload_json));

const payrollSyncBlockers = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
  outletId?: string,
) => {
  const [items, conflicts] = await Promise.all([
    repository.listPayrollSyncBlockerItems(env, companyId, outletId),
    repository.listPayrollSyncBlockerConflicts(env, companyId, outletId),
  ]);

  return {
    pending_sync_items: items.filter((item) => blockerItemMonth(item) === payrollMonth).length,
    unresolved_sync_conflicts: conflicts.filter((conflict) => blockerConflictMonth(conflict) === payrollMonth).length,
  };
};

export const hasPendingAttendanceSync = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
  outletId?: string,
) => {
  const blockers = await getPayrollSyncBlockers(env, companyId, payrollMonth, outletId);
  return (blockers?.pending_sync_items ?? 0) > 0;
};

export const hasUnresolvedSyncConflicts = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
  outletId?: string,
) => {
  const blockers = await getPayrollSyncBlockers(env, companyId, payrollMonth, outletId);
  return (blockers?.unresolved_sync_conflicts ?? 0) > 0;
};

export const hasUnmatchedOrFailedSyncItems = hasPendingAttendanceSync;
