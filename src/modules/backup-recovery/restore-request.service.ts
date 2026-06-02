import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import { AppError, NotFoundError } from "../../utils/errors";
import * as repository from "./backup-recovery.repository";
import type { ListFilters, RestoreRequestInput } from "./backup-recovery.types";

const audit = async (env: Env, context: AuthActor, action: string, entityId: string, reason: string) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "backup_recovery",
    action,
    severity: "high",
    entityType: "restore_request",
    entityId,
    actorId: context.actorUserId,
    reason,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

export const createRestoreRequest = async (env: Env, context: AuthActor, input: RestoreRequestInput) => {
  const id = crypto.randomUUID();
  await repository.createRestoreRequest(env, {
    id,
    companyId: context.companyId,
    backupId: input.backup_id,
    userId: context.actorUserId,
    restoreType: input.restore_scope,
    reason: input.reason,
  });
  await audit(env, context, "restore_request_created", id, input.reason);
  return { restore_request: { id, status: "pending", restore_scope: input.restore_scope } };
};

export const listRestoreRequests = (env: Env, context: AuthActor, filters: ListFilters) =>
  repository.listRestoreRequests(env, context.companyId, filters);

export const getRestoreRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRestoreRequest(env, context.companyId, id);
  if (!request) throw new NotFoundError("Restore request not found.");
  return {
    id: request.id,
    backup_id: request.backup_job_id,
    restore_scope: request.restore_type,
    status: request.status,
    requested_by: request.requested_by,
    approved_by: request.approved_by,
    reason: request.reason,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
};

export const updateRestoreRequest = async (env: Env, context: AuthActor, id: string, status: "approved" | "rejected", reason: string) => {
  await audit(env, context, status === "approved" ? "restore_request_approved" : "restore_request_rejected", id, reason);
  await repository.updateRestoreStatus(env, context.companyId, id, status, context.actorUserId);
  return { restore_request_id: id, status, executed: false };
};
