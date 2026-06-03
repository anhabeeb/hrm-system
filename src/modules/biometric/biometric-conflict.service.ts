import * as attendanceRepository from "../attendance/attendance.repository";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, DeviceAuthContext } from "../../types/api.types";
import { createPrefixedId } from "../../utils/ids";

export const createBiometricConflict = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    deviceId?: string | null;
    employeeId?: string | null;
    conflictType: string;
    localPayload?: Record<string, unknown>;
    serverPayload?: Record<string, unknown>;
    actor?: AuthActor;
    device?: DeviceAuthContext;
    reason?: string;
  },
) => {
  const id = createPrefixedId("att_conflict");
  await attendanceRepository.createConflict(env, {
    id,
    companyId: input.companyId,
    employeeId: input.employeeId,
    outletId: input.outletId,
    deviceId: input.deviceId ?? input.device?.deviceId,
    conflictType: input.conflictType,
    localPayloadJson: input.localPayload ? JSON.stringify(input.localPayload) : null,
    serverPayloadJson: input.serverPayload ? JSON.stringify(input.serverPayload) : null,
  });
  await createAuditLog(env, {
    companyId: input.companyId,
    outletId: input.outletId ?? undefined,
    module: "biometric",
    action: "biometric_conflict_created",
    severity: "warning",
    entityType: "attendance_conflict",
    entityId: id,
    employeeId: input.employeeId ?? undefined,
    actorId: input.actor?.actorUserId,
    deviceId: input.deviceId ?? input.device?.deviceId,
    reason: input.reason,
    details: {
      conflict_type: input.conflictType,
    },
    requestId: input.actor?.requestId ?? input.device?.requestId,
    ipAddress: input.actor?.ipAddress,
    userAgent: input.actor?.userAgent,
  }).catch(() => undefined);
  return { id, conflict_type: input.conflictType };
};
