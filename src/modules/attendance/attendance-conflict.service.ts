import * as repository from "./attendance.repository";
import type { AttendanceConflictType } from "./attendance.types";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, DeviceAuthContext } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

export const createAttendanceConflict = async (
  env: Env,
  payload: {
    companyId: string;
    employeeId?: string | null;
    outletId?: string | null;
    deviceId?: string | null;
    conflictType: AttendanceConflictType;
    localPayload?: Record<string, unknown>;
    serverPayload?: Record<string, unknown>;
    audit?: {
      module: "attendance" | "kiosk";
      actor?: AuthActor;
      device?: DeviceAuthContext;
      reason?: string;
      required?: boolean;
    };
  },
) => {
  const id = createPrefixedId("att_conflict");

  await repository.createConflict(env, {
    id,
    companyId: payload.companyId,
    employeeId: payload.employeeId,
    outletId: payload.outletId,
    deviceId: payload.deviceId,
    conflictType: payload.conflictType,
    localPayloadJson: payload.localPayload
      ? JSON.stringify(payload.localPayload)
      : null,
    serverPayloadJson: payload.serverPayload
      ? JSON.stringify(payload.serverPayload)
      : null,
  });
  if (payload.audit) {
    const result = await createAuditLog(env, {
      companyId: payload.companyId,
      outletId: payload.outletId ?? undefined,
      module: payload.audit.module,
      action:
        payload.audit.module === "kiosk"
          ? "kiosk_conflict_created"
          : "attendance_conflict_created",
      severity: "warning",
      entityType: "attendance_conflict",
      entityId: id,
      employeeId: payload.employeeId ?? undefined,
      actorId: payload.audit.actor?.actorUserId,
      deviceId: payload.audit.device?.deviceId,
      newValueJson: JSON.stringify({
        conflict_type: payload.conflictType,
        local_payload: payload.localPayload ?? null,
        server_payload: payload.serverPayload ?? null,
      }),
      reason: payload.audit.reason,
      requestId: payload.audit.actor?.requestId ?? payload.audit.device?.requestId,
      ipAddress: payload.audit.actor?.ipAddress,
      userAgent: payload.audit.actor?.userAgent,
    });

    if (!result.created && payload.audit.required) {
      throw new AppError(
        "Audit log could not be recorded. Please try again.",
        "SERVER_ERROR",
        500,
      );
    }
  }

  return { id };
};
