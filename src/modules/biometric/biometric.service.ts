import * as attendanceRepository from "../attendance/attendance.repository";
import { rebuildDailySummary } from "../attendance/attendance-summary.service";
import * as devicesRepository from "../devices/devices.repository";
import { createSyncChange } from "../sync/sync-change.service";
import { getMaxRecordsPerBatch } from "../sync/sync.service";
import {
  BIOMETRIC_FORBIDDEN_PAYLOAD_KEYS,
  BIOMETRIC_FUTURE_TOLERANCE_MINUTES,
  BIOMETRIC_TIME_WARNING_MINUTES,
  DEFAULT_BIOMETRIC_BATCH_SIZE,
} from "./biometric.constants";
import { createBiometricConflict } from "./biometric-conflict.service";
import { createBiometricDedupeKey, findDuplicateBiometricLog } from "./biometric-dedupe.service";
import * as repository from "./biometric.repository";
import type {
  BiometricBatchInput,
  BiometricDeviceInput,
  BiometricDeviceUpdateInput,
  BiometricListFilters,
  BiometricMappingInput,
  BiometricMappingUpdateInput,
  BiometricOutletScope,
  BiometricPunchInput,
  BiometricReasonInput,
} from "./biometric.types";
import { createAuditLog } from "../../services/audit.service";
import { safeNotifyResolvedRecipients } from "../../services/notification.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, DeviceAuthContext, PaginationMeta } from "../../types/api.types";
import { generateSecureToken, hashToken } from "../../utils/crypto";
import {
  AppError,
  ConflictError,
  DeviceAuthError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const eventDate = (eventTime: string) => eventTime.slice(0, 10);
const payrollMonth = (eventTime: string) => eventTime.slice(0, 7);
type BiometricSource = "push_api" | "bridge";

const normalizeDeviceTypeForSharedDevice = (type: string, syncMode?: string) => {
  if (syncMode === "local_bridge" || type === "bridge") return "bridge";
  if (type === "biometric" || ["fingerprint", "face", "multi_modal", "card", "pin"].includes(type)) return "biometric";
  return type;
};

const isBiometricCapableType = (type?: string | null) =>
  Boolean(type && ["biometric", "fingerprint", "face", "multi_modal", "card", "pin"].includes(type));

const normalizeEventType = (eventType: BiometricPunchInput["event_type"]) => {
  if (eventType === "check_in") return "clock_in";
  if (eventType === "check_out") return "clock_out";
  return eventType;
};

const publicDeviceStatus = (status?: string | null, lastSeenAt?: string | null) => {
  if (status === "disabled") return "suspended";
  if (status && status !== "active") return status;
  if (!lastSeenAt) return status ?? "active";
  const offlineMs = 24 * 60 * 60 * 1000;
  return Date.now() - new Date(lastSeenAt).getTime() > offlineMs ? "offline" : "active";
};

const scope = (context: AuthActor): BiometricOutletScope => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (outletId && !permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this outlet.");
  }
};

const audit = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    employeeId?: string | null;
    actor?: AuthActor;
    device?: DeviceAuthContext;
    reason?: string;
    details?: Record<string, unknown>;
    required?: boolean;
    severity?: string;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: input.companyId,
    outletId: input.outletId ?? undefined,
    module: "biometric",
    action: input.action,
    severity: input.severity,
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

const notifyBiometricReview = (
  env: Env,
  device: DeviceAuthContext,
  input: {
    logId: string;
    event: string;
    title: string;
    message: string;
    biometricUserId: string;
    outletId?: string | null;
    priority?: "normal" | "high" | "urgent";
  },
) =>
  safeNotifyResolvedRecipients(
    env,
    device.companyId,
    {
      permissionKeys: ["biometric.resolve_punches", "biometric.resolve_unmatched"],
      roleKeys: ["hr_admin", "admin"],
      outletId: input.outletId ?? device.outletId,
      fallbackToAdmins: true,
    },
    {
      notification_type: input.event,
      category: "biometric",
      priority: input.priority ?? "high",
      title: input.title,
      message: input.message,
      action_url: "/biometric?tab=unmatched",
      action_label: "Review biometric punch",
      entity_type: "biometric_attendance_log",
      entity_id: input.logId,
      event_key: input.event,
      idempotency_key: `${input.event}:${input.logId}`,
      outlet_id: input.outletId ?? device.outletId,
      metadata: {
        biometric_log_id: input.logId,
        biometric_user_id: input.biometricUserId,
        device_id: device.deviceId,
      },
    },
    { actorId: device.deviceId, requestId: device.requestId },
  );

const safeRawPayload = (
  input: BiometricPunchInput,
  source: BiometricSource,
): Record<string, unknown> => ({
  biometric_user_id: input.biometric_user_id,
  external_employee_identifier: input.external_employee_identifier,
  event_time: input.event_time,
  event_type: input.event_type,
  verification_method: input.verification_method ?? "unknown",
  device_event_id: input.device_event_id,
  raw_punch_code: input.raw_punch_code,
  outlet_id: input.outlet_id,
  bridge_app_version: input.bridge_app_version,
  source_device_serial: input.source_device_serial,
  source_device_name: input.source_device_name,
  source: source === "bridge" ? "local_bridge" : "push_api",
});

export const sanitizeBiometricDeviceForResponse = (device: any) => {
  if (!device) return null;
  return {
    id: device.id,
    device_id: device.id,
    outlet_id: device.outlet_id ?? null,
    device_name: device.device_name,
    device_serial: device.device_serial,
    device_code: device.device_code ?? null,
    external_device_id: device.external_device_id ?? null,
    device_type: device.device_type,
    vendor: device.vendor ?? null,
    model: device.model ?? null,
    sync_mode: device.sync_mode,
    status: publicDeviceStatus(device.status, device.last_seen_at),
    last_seen_at: device.last_seen_at ?? null,
    last_sync_at: device.last_sync_at ?? null,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
};

export const parseSafeJson = (value: string | null | undefined): Record<string, unknown> | null => {
  if (!value) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
  const stack = [parsed];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const [key, child] of Object.entries(current)) {
      if ((BIOMETRIC_FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(key)) {
        throw new AppError(
          "Biometric templates or images must not be uploaded to this system.",
          "BIOMETRIC_TEMPLATE_NOT_ALLOWED",
          400,
        );
      }
      if (child && typeof child === "object" && !Array.isArray(child)) {
        stack.push(child as Record<string, unknown>);
      }
    }
  }
  return parsed;
};

export const getOriginalDeviceEventId = (log: {
  id: string;
  raw_payload_json?: string | null;
}) => {
  const raw = parseSafeJson(log.raw_payload_json);
  const snake = raw?.device_event_id;
  const camel = raw?.deviceEventId;
  return typeof snake === "string" && snake
    ? snake
    : typeof camel === "string" && camel
      ? camel
      : log.id;
};

const assertBiometricDeviceCanPush = async (
  env: Env,
  device: DeviceAuthContext,
  source: BiometricSource,
) => {
  const biometricDevice = await repository.findDeviceById(env, device.companyId, device.deviceId);

  if (!biometricDevice) {
    throw new DeviceAuthError(
      "This device is not registered for biometric attendance.",
      "DEVICE_NOT_REGISTERED",
    );
  }

  if (biometricDevice.status && biometricDevice.status !== "active") {
    throw new DeviceAuthError(
      "This device is inactive. Please contact your system administrator.",
      "DEVICE_INACTIVE",
    );
  }

  if (biometricDevice.outlet_id && biometricDevice.outlet_id !== device.outletId) {
    throw new DeviceAuthError(
      "This device is not allowed to send biometric punches.",
      "DEVICE_OUTLET_SCOPE_DENIED",
    );
  }

  const sharedDeviceType = device.deviceType;
  const isBridgeDevice =
    biometricDevice.sync_mode === "local_bridge" ||
    biometricDevice.device_type === "bridge" ||
    sharedDeviceType === "bridge" ||
    sharedDeviceType === "local_bridge";
  const isPushBiometricDevice =
    biometricDevice.sync_mode === "push_api" &&
    isBiometricCapableType(biometricDevice.device_type) &&
    ["biometric", "biometric_placeholder"].includes(sharedDeviceType);

  if (source === "bridge" && !isBridgeDevice) {
    throw new DeviceAuthError(
      "This device is not allowed to use the biometric bridge endpoint.",
      "DEVICE_NOT_ALLOWED",
    );
  }

  if (source === "push_api" && !isPushBiometricDevice) {
    throw new DeviceAuthError(
      "This device is not allowed to send biometric punches.",
      "DEVICE_NOT_ALLOWED",
    );
  }

  await repository.touchBiometricDevice(env, device.companyId, device.deviceId).catch(() => undefined);
  return biometricDevice;
};

const assertPayrollUnlocked = async (env: Env, companyId: string, eventTime: string) => {
  const run = await attendanceRepository.findPayrollRunForMonth(env, companyId, payrollMonth(eventTime));
  if (["finalizing", "finalized", "locked", "paid"].includes(run?.status ?? "")) {
    throw new LockedRecordError("This biometric punch belongs to a finalized payroll period and needs review.");
  }
};

const futureTimestampIssueType = (eventTime: string) => {
  const parsed = new Date(eventTime);
  if (Number.isNaN(parsed.getTime())) return "conflict";
  const diff = (parsed.getTime() - Date.now()) / 60000;
  if (diff > BIOMETRIC_FUTURE_TOLERANCE_MINUTES) return "conflict";
  if (diff > BIOMETRIC_TIME_WARNING_MINUTES) return "warning";
  return null;
};

const createAttendanceFromBiometric = async (
  env: Env,
  device: DeviceAuthContext,
  logId: string,
  input: BiometricPunchInput,
  employeeId: string,
  outletId: string,
) => {
  const existing = await attendanceRepository.findEventByLocalId(
    env,
    device.companyId,
    device.deviceId,
    input.device_event_id ?? logId,
  );
  if (existing) return existing;

  const id = createPrefixedId("att");
  const sourceEventId = input.device_event_id ?? logId;
  const metadataJson = JSON.stringify({
    biometric_log_id: logId,
    biometric_user_id: input.biometric_user_id,
    verification_method: input.verification_method ?? "unknown",
    source: "biometric_device",
    raw_punch_code: input.raw_punch_code ?? null,
  });
  await attendanceRepository.createAttendanceEvent(env, {
    id,
    company_id: device.companyId,
    employee_id: employeeId,
    outlet_id: outletId,
    device_id: device.deviceId,
    event_type: normalizeEventType(input.event_type) as any,
    event_time: input.event_time,
    attendance_method: "biometric_device",
    source: "biometric_device",
    local_id: sourceEventId,
    source_device_id: device.deviceId,
    source_event_id: sourceEventId,
    metadata_json: metadataJson,
    created_offline: 0,
    sync_status: "synced",
    approval_status: "approved",
  });
  await rebuildDailySummary(env, device.companyId, employeeId, eventDate(input.event_time));
  await createSyncChange(env, {
    companyId: device.companyId,
    outletId,
    entityType: "attendance",
    entityId: id,
    actionType: input.event_type,
    changedBy: device.deviceId,
    payload: {
      employee_id: employeeId,
      event_time: input.event_time,
      event_type: normalizeEventType(input.event_type),
      source: "biometric_device",
    },
  });
  return attendanceRepository.findEventById(env, device.companyId, id).then((event) => event!);
};

export const processBiometricPunch = async (
  env: Env,
  device: DeviceAuthContext,
  input: BiometricPunchInput,
  source: BiometricSource = "push_api",
) => {
  if (!device.outletId) throw new OutletAccessError("This device is not assigned to an outlet.");
  const biometricDevice = await assertBiometricDeviceCanPush(env, device, source);
  if (input.outlet_id && input.outlet_id !== device.outletId) {
    throw new DeviceAuthError(
      "This device is not allowed to submit punches for this outlet.",
      "DEVICE_OUTLET_SCOPE_DENIED",
    );
  }
  const dedupeKey = createBiometricDedupeKey(device.companyId, device.deviceId, input);
  const duplicate = await findDuplicateBiometricLog(env, device.companyId, dedupeKey);
  if (duplicate) {
    await audit(env, {
      companyId: device.companyId,
      outletId: duplicate.outlet_id,
      action: "biometric_log_deduped",
      entityType: "biometric_attendance_log",
      entityId: duplicate.id,
      employeeId: duplicate.employee_id,
      device,
      severity: "info",
    });
    return { log_id: duplicate.id, deduped: true, already_accepted: true };
  }

  const mappings = await repository.findMappingsByBiometricUserId(env, device.companyId, device.deviceId, input.biometric_user_id);
  const mapping = mappings.length === 1 ? mappings[0] : null;
  const logId = createPrefixedId("bio_log");
  await repository.createLog(env, {
    id: logId,
    company_id: device.companyId,
    device_id: device.deviceId,
    outlet_id: device.outletId,
    biometric_user_id: input.biometric_user_id,
    employee_id: mapping?.employee_id ?? null,
    event_time: input.event_time,
    server_received_at: nowIso(),
    event_type: normalizeEventType(input.event_type) as any,
    verification_method: input.verification_method ?? "unknown",
    raw_payload_json: JSON.stringify(safeRawPayload(input, source)),
    dedupe_key: dedupeKey,
    source_event_id: input.device_event_id ?? null,
    device_timestamp: input.event_time,
    sync_status: "pending",
  });
  await audit(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    action: "biometric_punch_received",
    entityType: "biometric_attendance_log",
    entityId: logId,
    employeeId: mapping?.employee_id,
    device,
  });

  if (mappings.length > 1) {
    await repository.updateLogStatus(env, device.companyId, logId, "ambiguous_employee", null);
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_ambiguous_employee",
      entityType: "biometric_attendance_log",
      entityId: logId,
      device,
      severity: "warning",
      details: { biometric_user_id: input.biometric_user_id, match_count: mappings.length },
    });
    void notifyBiometricReview(env, device, {
      logId,
      event: "biometric_ambiguous_punch_review",
      title: "Ambiguous biometric punch needs review",
      message: "A biometric punch matched multiple employees and needs manual review.",
      biometricUserId: input.biometric_user_id,
      outletId: device.outletId,
      priority: "high",
    });
    return { log_id: logId, ambiguous: true };
  }

  const futureIssue = futureTimestampIssueType(input.event_time);
  if (futureIssue === "conflict") {
    await repository.updateLogStatus(env, device.companyId, logId, "invalid_timestamp", mapping?.employee_id ?? null);
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_invalid_timestamp",
      entityType: "biometric_attendance_log",
      entityId: logId,
      employeeId: mapping?.employee_id,
      device,
      severity: "warning",
      details: { device_serial: biometricDevice.device_serial },
    });
    return { log_id: logId, invalid_timestamp: true };
  }

  if (input.event_type === "unknown") {
    await repository.updateLogStatus(env, device.companyId, logId, "rejected", mapping?.employee_id ?? null);
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_unknown_punch_type",
      entityType: "biometric_attendance_log",
      entityId: logId,
      employeeId: mapping?.employee_id,
      device,
      severity: "warning",
      details: { raw_punch_code: input.raw_punch_code ?? null },
    });
    return { log_id: logId, rejected: true };
  }

  const result = await applyBiometricLog(env, device, logId, input, mapping, source);
  await broadcastEvent(env, {
    roomName: `company:${device.companyId}`,
    type: "attendance_event_id" in result ? "attendance.updated" : "biometric.punch_received",
    payload: { log_id: logId, outlet_id: device.outletId },
    triggeredBy: device.deviceId,
  }).catch(() => undefined);
  return result;
};

const applyBiometricLog = async (
  env: Env,
  device: DeviceAuthContext,
  logId: string,
  input: BiometricPunchInput,
  mapping: any,
  source: BiometricSource,
) => {
  if (!device.outletId) throw new OutletAccessError("This device is not assigned to an outlet.");
  if (!mapping) {
    await repository.updateLogStatus(env, device.companyId, logId, "unmatched_employee", null);
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_unmatched_user",
      entityType: "biometric_attendance_log",
      entityId: logId,
      device,
      severity: "warning",
      details: { biometric_user_id: input.biometric_user_id },
    });
    void notifyBiometricReview(env, device, {
      logId,
      event: "biometric_unmatched_punch_review",
      title: "Unmatched biometric punch needs review",
      message: "A biometric punch was received for an unmapped biometric user.",
      biometricUserId: input.biometric_user_id,
      outletId: device.outletId,
      priority: "high",
    });
    return { log_id: logId, unmatched: true };
  }

  if (mapping.deleted_at || ["archived", "resigned", "terminated", "retired", "inactive"].includes(mapping.employment_status)) {
    const conflict = await createBiometricConflict(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      device,
      employeeId: mapping.employee_id,
      conflictType: "inactive_employee",
      localPayload: safeRawPayload(input, source),
      serverPayload: { employment_status: mapping.employment_status },
    });
    await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
    return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
  }

  if (mapping.primary_outlet_id !== device.outletId) {
    const conflict = await createBiometricConflict(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      device,
      employeeId: mapping.employee_id,
      conflictType: "wrong_outlet",
      localPayload: safeRawPayload(input, source),
      serverPayload: { primary_outlet_id: mapping.primary_outlet_id },
    });
    await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
    return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
  }

  const timeIssue = futureTimestampIssueType(input.event_time);
  if (timeIssue === "conflict") {
    const conflict = await createBiometricConflict(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      device,
      employeeId: mapping.employee_id,
      conflictType: "device_time_warning_placeholder",
      localPayload: safeRawPayload(input, source),
    });
    await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
    return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
  }

  try {
    await assertPayrollUnlocked(env, device.companyId, input.event_time);
  } catch (error) {
    if (error instanceof LockedRecordError) {
      const conflict = await createBiometricConflict(env, {
        companyId: device.companyId,
        outletId: device.outletId,
        device,
        employeeId: mapping.employee_id,
        conflictType: "payroll_locked",
        localPayload: safeRawPayload(input, source),
      });
      await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
      return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
    }
    throw error;
  }

  const existingSummary = await attendanceRepository.findDailySummary(
    env,
    device.companyId,
    mapping.employee_id,
    eventDate(input.event_time),
  );
  if (existingSummary?.correction_applied_id) {
    const conflict = await createBiometricConflict(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      device,
      employeeId: mapping.employee_id,
      conflictType: "manual_vs_device",
      localPayload: safeRawPayload(input, source),
      serverPayload: {
        correction_applied_id: existingSummary.correction_applied_id,
        attendance_date: eventDate(input.event_time),
      },
    });
    await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
    return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
  }

  const existingEvents = await attendanceRepository.listEventsForDate(
    env,
    device.companyId,
    mapping.employee_id,
    eventDate(input.event_time),
  );
  const normalizedEventType = normalizeEventType(input.event_type);
  if (existingEvents.some((event) => event.event_type === normalizedEventType && event.event_time === input.event_time)) {
    await repository.updateLogStatus(env, device.companyId, logId, "duplicate", mapping.employee_id);
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_duplicate_punch_received",
      entityType: "biometric_attendance_log",
      entityId: logId,
      employeeId: mapping.employee_id,
      device,
      severity: "info",
      details: { duplicate_type: "same_event_type_and_time" },
    });
    return { log_id: logId, deduped: true };
  }
  if (existingEvents.some((event) => event.event_type === normalizedEventType)) {
    const conflict = await createBiometricConflict(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      device,
      employeeId: mapping.employee_id,
      conflictType: "duplicate_punch",
      localPayload: safeRawPayload(input, source),
    });
    await repository.updateLogStatus(env, device.companyId, logId, "conflict", mapping.employee_id);
    return { log_id: logId, conflict_created: true, conflict_type: conflict.conflict_type };
  }

  const event = await createAttendanceFromBiometric(
    env,
    device,
    logId,
    input,
    mapping.employee_id,
    device.outletId,
  );
  await repository.updateLogStatus(env, device.companyId, logId, "accepted", mapping.employee_id);
  await repository.updateLogAttendanceEvent(env, device.companyId, logId, event.id).catch(() => undefined);
  await audit(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    action: "biometric_log_accepted",
    entityType: "biometric_attendance_log",
    entityId: logId,
    employeeId: mapping.employee_id,
    device,
    details: { attendance_event_id: event.id },
  });
  await audit(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    action: "attendance_event_created_from_device_punch",
    entityType: "attendance_event",
    entityId: event.id,
    employeeId: mapping.employee_id,
    device,
    details: { log_id: logId },
  });
  if (timeIssue === "warning") {
    await audit(env, {
      companyId: device.companyId,
      outletId: device.outletId,
      action: "biometric_device_time_warning",
      entityType: "biometric_attendance_log",
      entityId: logId,
      employeeId: mapping.employee_id,
      device,
      severity: "warning",
      details: { warning_type: "device_time_warning" },
    });
  }
  return {
    log_id: logId,
    attendance_event_id: event.id,
    summary_id: `${mapping.employee_id}:${eventDate(input.event_time)}`,
    ...(timeIssue === "warning"
      ? { warning: true, warning_type: "device_time_warning" }
      : {}),
  };
};

export const processBatch = async (
  env: Env,
  device: DeviceAuthContext,
  input: BiometricBatchInput,
  source: BiometricSource,
) => {
  await assertBiometricDeviceCanPush(env, device, source);

  await audit(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    action: source === "bridge" ? "biometric_bridge_batch_received" : "biometric_batch_received",
    entityType: "biometric_batch",
    entityId: input.batch_id,
    device,
    details: { count: input.logs.length },
  });

  const accepted: unknown[] = [];
  const deduped: unknown[] = [];
  const conflicts: unknown[] = [];
  const unmatched: unknown[] = [];
  const rejected: unknown[] = [];

  for (const log of input.logs) {
    try {
      const result = await processBiometricPunch(
        env,
        device,
        {
          ...log,
          bridge_app_version: log.bridge_app_version ?? input.bridge_app_version,
          source_device_serial: log.source_device_serial ?? input.source_device_serial,
          source_device_name: log.source_device_name ?? input.source_device_name,
        },
        source,
      );
      if ("attendance_event_id" in result) accepted.push(result);
      else if ("deduped" in result) deduped.push(result);
      else if ("unmatched" in result) unmatched.push(result);
      else if ("conflict_created" in result) conflicts.push(result);
    } catch (error) {
      rejected.push({
        biometric_user_id: log.biometric_user_id,
        error: error instanceof Error ? error.message : "This biometric punch could not be processed.",
      });
    }
  }
  return { batch_id: input.batch_id, accepted, deduped, conflicts, unmatched, rejected };
};

export const getMaxBiometricBatchSize = async (env: Env, companyId: string) =>
  getMaxRecordsPerBatch(env, companyId).catch(() => DEFAULT_BIOMETRIC_BATCH_SIZE);

export const listDevices = async (env: Env, context: AuthActor, filters: BiometricListFilters) => {
  const [total, rows] = await Promise.all([
    repository.countDevices(env, context.companyId, filters, scope(context)),
    repository.listDevices(env, context.companyId, filters, scope(context)),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

const pagination = (filters: BiometricListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

export const getDevice = async (env: Env, context: AuthActor, id: string) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Biometric device not found.");
  assertOutletAccess(context, device.outlet_id);
  return sanitizeBiometricDeviceForResponse(device);
};

export const registerDevice = async (env: Env, context: AuthActor, input: BiometricDeviceInput) => {
  assertOutletAccess(context, input.outlet_id);
  const duplicate = await repository.findDeviceByIdentifier(env, context.companyId, input.device_serial);
  if (duplicate) throw new ConflictError("This biometric device serial is already registered.");
  if (input.device_code) {
    const codeDuplicate = await repository.findDeviceByIdentifier(env, context.companyId, input.device_code);
    if (codeDuplicate) throw new ConflictError("This biometric device code is already registered.");
  }
  if (input.external_device_id) {
    const externalDuplicate = await repository.findDeviceByIdentifier(env, context.companyId, input.external_device_id);
    if (externalDuplicate) throw new ConflictError("This external biometric device ID is already registered.");
  }
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken, env.DEVICE_TOKEN_SECRET);
  const id = createPrefixedId("bio_device");
  await repository.createDevice(env, id, context.companyId, input, tokenHash, context.actorUserId);
  await devicesRepository.createDevice(env, {
    id,
    companyId: context.companyId,
    outletId: input.outlet_id,
    deviceName: input.device_name,
    deviceType: normalizeDeviceTypeForSharedDevice(input.device_type, input.sync_mode),
    tokenHash,
  });
  await devicesRepository.createDeviceSyncState(env, {
    id: createPrefixedId("dev_state"),
    companyId: context.companyId,
    outletId: input.outlet_id,
    deviceId: id,
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id,
    action: "biometric_device_registered",
    entityType: "biometric_device",
    entityId: id,
    actor: context,
    required: true,
  });
  return { device_id: id, device_token: rawToken, token_shown_once: true };
};

export const updateDevice = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricDeviceUpdateInput,
) => {
  const existing = await repository.findDeviceById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Biometric device not found.");
  assertOutletAccess(context, existing.outlet_id);
  if (input.outlet_id) assertOutletAccess(context, input.outlet_id);
  const nextIdentifier = input.device_serial ?? input.device_code ?? input.external_device_id;
  if (nextIdentifier) {
    const duplicate = await repository.findDeviceByIdentifier(env, context.companyId, nextIdentifier);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError("This biometric device identifier is already registered.");
    }
  }
  await repository.updateDevice(env, context.companyId, id, input);
  await devicesRepository.updateDevice(env, context.companyId, id, {
    outletId: input.outlet_id,
    deviceName: input.device_name,
    deviceType: input.device_type ? normalizeDeviceTypeForSharedDevice(input.device_type, input.sync_mode) : undefined,
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: input.outlet_id ?? existing.outlet_id,
    action: "biometric_device_updated",
    entityType: "biometric_device",
    entityId: id,
    actor: context,
    details: input as Record<string, unknown>,
    required: true,
  });
  return { updated: true };
};

export const setDeviceStatus = async (
  env: Env,
  context: AuthActor,
  id: string,
  status: "active" | "suspended" | "revoked" | "disabled",
  input: BiometricReasonInput,
) => {
  const existing = await repository.findDeviceById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Biometric device not found.");
  assertOutletAccess(context, existing.outlet_id);
  const nextStatus = status === "disabled" ? "suspended" : status;
  await repository.updateDeviceStatus(env, context.companyId, id, nextStatus, context.actorUserId, input.reason);
  await devicesRepository.updateDeviceStatus(env, context.companyId, id, nextStatus);
  await audit(env, {
    companyId: context.companyId,
    outletId: existing.outlet_id,
    action: nextStatus === "active" ? "biometric_device_activated" : nextStatus === "revoked" ? "biometric_device_revoked" : "biometric_device_suspended",
    entityType: "biometric_device",
    entityId: id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return nextStatus === "active" ? { enabled: true } : nextStatus === "revoked" ? { revoked: true } : { disabled: true };
};

export const rotateDeviceToken = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricReasonInput,
) => {
  const existing = await repository.findDeviceById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Biometric device not found.");
  assertOutletAccess(context, existing.outlet_id);
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken, env.DEVICE_TOKEN_SECRET);
  await repository.updateDeviceToken(env, context.companyId, id, tokenHash);
  await devicesRepository.updateDeviceToken(env, context.companyId, id, tokenHash);
  await audit(env, {
    companyId: context.companyId,
    outletId: existing.outlet_id,
    action: "biometric_device_token_rotated",
    entityType: "biometric_device",
    entityId: id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return { device_id: id, device_token: rawToken, token_shown_once: true };
};

export const listMappings = async (env: Env, context: AuthActor, filters: BiometricListFilters) => {
  const [total, rows] = await Promise.all([
    repository.countMappings(env, context.companyId, filters, scope(context)),
    repository.listMappings(env, context.companyId, filters, scope(context)),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

const ensureEmployeeOutlet = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await attendanceRepository.findEmployeeForAttendance(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  assertOutletAccess(context, employee.primary_outlet_id);
  return employee;
};

export const createMapping = async (env: Env, context: AuthActor, input: BiometricMappingInput) => {
  const employee = await ensureEmployeeOutlet(env, context, input.employee_id);
  const device = await repository.findDeviceById(env, context.companyId, input.device_id);
  if (!device) throw new NotFoundError("Biometric device not found.");
  assertOutletAccess(context, device.outlet_id);
  const duplicate = await repository.findMapping(env, context.companyId, input.device_id, input.biometric_user_id);
  if (duplicate) throw new ConflictError("This biometric user ID is already mapped for this device.");
  const id = createPrefixedId("bio_map");
  await repository.createMapping(env, {
    id,
    companyId: context.companyId,
    employeeId: input.employee_id,
    deviceId: input.device_id,
    biometricUserId: input.biometric_user_id,
    enrollmentStatus: input.enrollment_status ?? "enrolled",
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id,
    action: "biometric_mapping_created",
    entityType: "employee_biometric_link",
    entityId: id,
    employeeId: input.employee_id,
    actor: context,
    required: true,
  });
  return { mapping_id: id };
};

export const updateMapping = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricMappingUpdateInput,
) => {
  const existing = await repository.findMappingById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Biometric mapping not found.");
  assertOutletAccess(context, existing.primary_outlet_id);
  if (input.employee_id) await ensureEmployeeOutlet(env, context, input.employee_id);
  await repository.updateMapping(env, context.companyId, id, {
    employeeId: input.employee_id,
    biometricUserId: input.biometric_user_id,
    enrollmentStatus: input.enrollment_status,
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: existing.primary_outlet_id,
    action: "biometric_mapping_updated",
    entityType: "employee_biometric_link",
    entityId: id,
    employeeId: input.employee_id ?? existing.employee_id,
    actor: context,
    details: input as Record<string, unknown>,
    required: true,
  });
  return { updated: true };
};

export const disableMapping = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricReasonInput,
) => {
  const existing = await repository.findMappingById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Biometric mapping not found.");
  assertOutletAccess(context, existing.primary_outlet_id);
  await repository.disableMapping(env, context.companyId, id);
  await audit(env, {
    companyId: context.companyId,
    outletId: existing.primary_outlet_id,
    action: "biometric_mapping_disabled",
    entityType: "employee_biometric_link",
    entityId: id,
    employeeId: existing.employee_id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return { disabled: true };
};

export const listLogs = async (
  env: Env,
  context: AuthActor,
  filters: BiometricListFilters,
  unmatched = false,
) => {
  const [total, rows] = await Promise.all([
    repository.countLogs(env, context.companyId, filters, scope(context), unmatched),
    repository.listLogs(env, context.companyId, filters, scope(context), unmatched),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const getLog = async (env: Env, context: AuthActor, id: string) => {
  const log = await repository.findLogById(env, context.companyId, id);
  if (!log) throw new NotFoundError("Biometric log not found.");
  if (log.sync_status === "rejected") {
    throw new ConflictError("Rejected biometric punches cannot be reprocessed.");
  }
  assertOutletAccess(context, log.outlet_id);
  const { raw_payload_json: _raw, ...safe } = log;
  return safe;
};

export const reprocessBiometricLog = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricReasonInput,
) => {
  const log = await repository.findLogById(env, context.companyId, id);
  if (!log) throw new NotFoundError("Biometric log not found.");
  if (log.sync_status === "rejected") {
    throw new ConflictError("Rejected biometric punches cannot be reprocessed.");
  }
  assertOutletAccess(context, log.outlet_id);
  const deviceContext: DeviceAuthContext = {
    requestId: context.requestId ?? "",
    companyId: context.companyId,
    deviceId: log.device_id,
    outletId: log.outlet_id,
    deviceType: "biometric",
  };
  const punch: BiometricPunchInput = {
    biometric_user_id: log.biometric_user_id,
    event_time: log.event_time,
    event_type: log.event_type as any,
    verification_method: (log.verification_method as any) ?? "unknown",
    device_event_id: getOriginalDeviceEventId(log),
  };
  const mapping = await repository.findMapping(env, context.companyId, log.device_id, log.biometric_user_id);
  const rawSource = parseSafeJson(log.raw_payload_json)?.source;
  const source = rawSource === "bridge" || rawSource === "local_bridge" || rawSource === "biometric_bridge"
    ? "bridge"
    : "push_api";
  const result = await applyBiometricLog(env, deviceContext, log.id, punch, mapping, source);
  await audit(env, {
    companyId: context.companyId,
    outletId: log.outlet_id,
    action: "biometric_log_reprocessed",
    entityType: "biometric_attendance_log",
    entityId: id,
    employeeId: log.employee_id,
    actor: context,
    reason: input.reason,
    details: result,
    required: true,
  });
  return result;
};

export const mapUnmatchedLog = async (
  env: Env,
  context: AuthActor,
  logId: string,
  input: { employee_id: string; reason: string },
) => {
  const log = await repository.findLogById(env, context.companyId, logId);
  if (!log) throw new NotFoundError("Biometric log not found.");
  assertOutletAccess(context, log.outlet_id);
  const employee = await ensureEmployeeOutlet(env, context, input.employee_id);
  const existing = await repository.findMapping(env, context.companyId, log.device_id, log.biometric_user_id);
  if (!existing) {
    await repository.createMapping(env, {
      id: createPrefixedId("bio_map"),
      companyId: context.companyId,
      employeeId: input.employee_id,
      deviceId: log.device_id,
      biometricUserId: log.biometric_user_id,
      enrollmentStatus: "enrolled",
    });
  }
  await repository.resolveLog(env, context.companyId, logId, {
    status: "manually_resolved",
    employeeId: input.employee_id,
    actorId: context.actorUserId,
    reason: input.reason,
  });
  const result = await reprocessBiometricLog(env, context, logId, { reason: input.reason });
  await audit(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id,
    action: "biometric_punch_manually_linked",
    entityType: "biometric_attendance_log",
    entityId: logId,
    employeeId: input.employee_id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return result;
};

export const rejectBiometricLog = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: BiometricReasonInput,
) => {
  const log = await repository.findLogById(env, context.companyId, id);
  if (!log) throw new NotFoundError("Biometric log not found.");
  assertOutletAccess(context, log.outlet_id);
  await repository.resolveLog(env, context.companyId, id, {
    status: "rejected",
    actorId: context.actorUserId,
    reason: input.reason,
  });
  await audit(env, {
    companyId: context.companyId,
    outletId: log.outlet_id,
    action: "biometric_punch_rejected",
    entityType: "biometric_attendance_log",
    entityId: id,
    employeeId: log.employee_id,
    actor: context,
    reason: input.reason,
    required: true,
  });
  return { rejected: true };
};

export const deviceStatus = async (env: Env, device: DeviceAuthContext) => {
  const biometricDevice = await assertBiometricDeviceCanPush(env, device, "bridge");
  return {
    device_id: device.deviceId,
    outlet_id: device.outletId,
    device_type: "biometric",
    status: biometricDevice?.status ?? "active",
    last_seen_at: biometricDevice?.last_seen_at ?? null,
    last_sync_at: biometricDevice?.last_sync_at ?? null,
    server_time: nowIso(),
  };
};
