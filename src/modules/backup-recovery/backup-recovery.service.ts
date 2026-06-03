import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import { AppError, NotFoundError } from "../../utils/errors";
import { buildBackupSnapshot } from "./backup-snapshot.service";
import { getBackupObject, putBackupObject } from "./backup-storage.service";
import * as retentionService from "./backup-retention.service";
import * as restoreService from "./restore-request.service";
import * as repository from "./backup-recovery.repository";
import type { BackupCreateInput, ListFilters, RetentionPolicyInput, RestoreRequestInput } from "./backup-recovery.types";

const audit = async (env: Env, context: AuthActor, action: string, entityType: string, entityId: string, reason?: string) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "backup_recovery",
    action,
    severity: "high",
    entityType,
    entityId,
    actorId: context.actorUserId,
    reason,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

export const createBackup = async (env: Env, context: AuthActor, input: BackupCreateInput) => {
  const createdAt = new Date().toISOString();
  const snapshot = await buildBackupSnapshot(env, context, input.backup_type);
  const body = JSON.stringify(snapshot, null, 2);
  const stored = await putBackupObject(env, context.companyId, body);
  const id = crypto.randomUUID();
  await audit(env, context, "backup_job_created", "backup_job", id, input.reason);
  await repository.createBackupJob(env, { id, companyId: context.companyId, backupType: input.backup_type, fileKey: stored.fileKey, fileName: stored.fileName, fileSize: stored.fileSize, userId: context.actorUserId });
  await audit(env, context, "backup_completed", "backup_job", id, input.reason);
  return { backup_job: { id, status: "completed", file_ready: true, backup_type: input.backup_type, created_at: createdAt } };
};

export const listBackups = (env: Env, context: AuthActor, filters: ListFilters) => repository.listBackups(env, context.companyId, filters);

export const getBackup = async (env: Env, context: AuthActor, id: string) => {
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup) throw new NotFoundError("Backup job not found.");
  const { storage_location: _storage, ...safe } = backup;
  return { ...safe, file_ready: Boolean(backup.storage_location) };
};

export const downloadBackup = async (env: Env, context: AuthActor, id: string) => {
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup) throw new NotFoundError("Backup job not found.");
  if (!backup.storage_location) throw new AppError("Backup file is not ready yet.", "BACKUP_NOT_READY", 409);
  await audit(env, context, "backup_downloaded", "backup_job", id);
  const object = await getBackupObject(env, backup.storage_location);
  if (!object) throw new AppError("Backup file is not ready yet.", "BACKUP_NOT_READY", 409);
  return new Response(object.body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${backup.file_name ?? `backup-${id}.json`}"`,
      "cache-control": "private, no-store",
    },
  });
};

export const verifyBackup = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup?.storage_location) throw new AppError("Backup file is not ready yet.", "BACKUP_NOT_READY", 409);
  const object = await getBackupObject(env, backup.storage_location);
  if (!object) throw new AppError("Backup file is not ready yet.", "BACKUP_NOT_READY", 409);
  JSON.parse(await object.text());
  await audit(env, context, "backup_verified", "backup_job", id, reason);
  return { backup_job_id: id, verified: true };
};

export const deleteBackup = async (env: Env, context: AuthActor, id: string, reason: string) => {
  await audit(env, context, "backup_deleted", "backup_job", id, reason);
  await repository.markBackupDeleted(env, context.companyId, id);
  return { backup_job_id: id, status: "deleted" };
};

export const getStatus = async (env: Env, context: AuthActor) => ({
  ...(await repository.latestBackupStatus(env, context.companyId)),
  failed_backup_count: await repository.failedBackupCount(env, context.companyId),
  backup_bucket_configured: Boolean(env.BACKUP_BUCKET),
  retention_policy_summary: await retentionService.getRetentionPolicy(env, context.companyId),
  next_scheduled_backup_placeholder: null,
});

export const getRetentionPolicy = (env: Env, context: AuthActor) => retentionService.getRetentionPolicy(env, context.companyId);
export const updateRetentionPolicy = async (env: Env, context: AuthActor, input: RetentionPolicyInput) => {
  const updated = await retentionService.updateRetentionPolicy(env, context.companyId, input);
  await audit(env, context, "backup_retention_policy_updated", "backup_retention_policy", context.companyId, input.reason);
  return updated;
};

export const createRestoreRequest = (env: Env, context: AuthActor, input: RestoreRequestInput) => restoreService.createRestoreRequest(env, context, input);
export const listRestoreRequests = (env: Env, context: AuthActor, filters: ListFilters) => restoreService.listRestoreRequests(env, context, filters);
export const getRestoreRequest = (env: Env, context: AuthActor, id: string) => restoreService.getRestoreRequest(env, context, id);
export const approveRestoreRequest = (env: Env, context: AuthActor, id: string, reason: string) => restoreService.updateRestoreRequest(env, context, id, "approved", reason);
export const rejectRestoreRequest = (env: Env, context: AuthActor, id: string, reason: string) => restoreService.updateRestoreRequest(env, context, id, "rejected", reason);
