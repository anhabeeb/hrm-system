import * as repository from "./sync.repository";
import type { SyncConflictType } from "./sync.types";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, DeviceAuthContext } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const friendlyMessages: Record<string, string> = {
  wrong_outlet: "This employee is not assigned to this outlet.",
  inactive_employee: "This employee is not active.",
  payroll_locked: "This attendance period is locked because payroll is locked.",
  missing_employee: "The employee could not be found.",
  device_time_warning: "Device time may be incorrect. Please review this attendance record.",
  duplicate_punch: "This attendance record already exists.",
  unsupported_item: "This offline record type is not supported yet.",
  invalid_payload: "This offline record could not be processed.",
};

export const getSyncConflictMessage = (conflictType: string) =>
  friendlyMessages[conflictType] ?? "This offline record needs review.";

export const createSyncConflict = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    deviceId?: string | null;
    employeeId?: string | null;
    entityType: string;
    localId?: string | null;
    conflictType: SyncConflictType | string;
    localPayload?: Record<string, unknown>;
    serverPayload?: Record<string, unknown>;
    actor?: AuthActor;
    device?: DeviceAuthContext;
    reason?: string;
    auditRequired?: boolean;
  },
) => {
  const id = createPrefixedId("sync_conflict");
  await repository.createConflict(env, {
    id,
    companyId: input.companyId,
    outletId: input.outletId,
    deviceId: input.deviceId ?? input.device?.deviceId ?? null,
    employeeId: input.employeeId,
    entityType: input.entityType,
    localId: input.localId,
    conflictType: input.conflictType,
    localPayloadJson: input.localPayload ? JSON.stringify(input.localPayload) : null,
    serverPayloadJson: input.serverPayload ? JSON.stringify(input.serverPayload) : null,
  });

  const audit = await createAuditLog(env, {
    companyId: input.companyId,
    outletId: input.outletId ?? undefined,
    module: "sync",
    action: "sync_conflict_created",
    severity: "warning",
    entityType: "sync_conflict",
    entityId: id,
    employeeId: input.employeeId ?? undefined,
    actorId: input.actor?.actorUserId,
    deviceId: input.deviceId ?? input.device?.deviceId,
    reason: input.reason,
    details: {
      conflict_type: input.conflictType,
      message: getSyncConflictMessage(input.conflictType),
      local_id: input.localId,
    },
    requestId: input.actor?.requestId ?? input.device?.requestId,
    ipAddress: input.actor?.ipAddress,
    userAgent: input.actor?.userAgent,
  });

  if (!audit.created && input.auditRequired) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }

  return {
    id,
    conflict_type: input.conflictType,
    message: getSyncConflictMessage(input.conflictType),
  };
};
