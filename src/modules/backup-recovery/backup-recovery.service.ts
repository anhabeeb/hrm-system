import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { AppError, NotFoundError, PermissionError } from "../../utils/errors";
import { safeAttachmentHeader } from "../../utils/security";
import { BACKUP_SCHEMA_VERSION, RESTORE_CONFIRMATION_PHRASE } from "./backup-recovery.constants";
import { buildBackupSnapshot, calculateBackupPackageChecksum, calculateChecksum, calculateTableChecksums } from "./backup-snapshot.service";
import { getBackupObject, putBackupObject } from "./backup-storage.service";
import * as retentionService from "./backup-retention.service";
import * as restoreService from "./restore-request.service";
import * as repository from "./backup-recovery.repository";
import type { BackupCreateInput, BackupRestoreSettingsInput, ListFilters, RestoreApplyInput, RestoreJobInput, RetentionPolicyInput, RestoreRequestInput } from "./backup-recovery.types";

const backupSettingsKey = "backup.restore_settings";
const SUPPORTED_RESTORE_TABLES = new Set(["company_settings"]);
const SUPPORTED_APPLY_MODES = new Set(["insert_missing", "update_existing", "upsert"]);

const audit = async (env: Env, context: AuthActor, action: string, entityType: string, entityId: string, reason?: string, metadata?: Record<string, unknown>) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "backup_recovery",
    action,
    severity: "high",
    entityType,
    entityId,
    actorId: context.actorUserId,
    reason,
    details: metadata,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

const hasAny = (context: AuthActor, permissions: string[]) =>
  context.isSuperAdmin || context.isAdmin || permissionService.hasAnyPermission(context, permissions);

const requireAny = (context: AuthActor, permissions: string[], code = "BACKUP_PERMISSION_DENIED") => {
  if (!hasAny(context, permissions)) throw new PermissionError("You do not have permission to perform this backup or restore action.", code);
};

const getSettingsInternal = async (env: Env, companyId: string) => {
  const row = await repository.getSetting(env, companyId, backupSettingsKey);
  const stored = row?.setting_value_json ? JSON.parse(row.setting_value_json) as Record<string, unknown> : {};
  return {
    backup_enabled: stored.backup_enabled !== false,
    allowed_backup_types: ["company_data", "metadata_only", "metadata", "configuration", "full_metadata"],
    r2_storage_status: "configured",
    backup_expiry_days: Number(stored.backup_expiry_days ?? 30),
    max_backup_rows: Number(stored.max_backup_rows ?? 5000),
    max_backup_size: Number(stored.max_backup_size ?? 5_000_000),
    allow_manual_backup: stored.allow_manual_backup !== false,
    allow_restore_preview: stored.allow_restore_preview !== false,
    allow_restore_apply: stored.allow_restore_apply !== false,
    require_confirmation_phrase: RESTORE_CONFIRMATION_PHRASE,
    require_super_admin_for_restore: stored.require_super_admin_for_restore !== false,
    include_audit_logs: stored.include_audit_logs === true,
    include_notification_history: stored.include_notification_history === true,
    include_import_export_history: stored.include_import_export_history !== false,
    include_document_metadata: stored.include_document_metadata !== false,
    include_document_file_manifest: stored.include_document_file_manifest === true,
    reason_required_for_restore: true,
    reason_required_for_settings_changes: true,
  };
};

const safeJob = (job: any) => {
  if (!job) return job;
  const { storage_location: _storage, file_storage_key: _fileStorageKey, metadata_json: _metadata, content_json: _content, ...safe } = job;
  return {
    ...safe,
    file_ready: job.status === "completed" && Boolean(job.storage_location || job.content_json),
    file_storage_configured: Boolean(job.storage_location),
  };
};

const backupBodyForJob = async (env: Env, context: AuthActor, job: any) => {
  if (job.storage_location) {
    const object = await getBackupObject(env, job.storage_location);
    if (object) return await object.text();
  }
  if (job.content_json) return String(job.content_json);
  throw new AppError("Backup content is not available from stable storage.", "BACKUP_CONTENT_NOT_AVAILABLE", 409);
};

const parseBackupBody = (body: string) => JSON.parse(body) as {
  manifest?: Record<string, any>;
  tables?: Record<string, { row_count?: number; rows?: Record<string, unknown>[] }>;
  redaction_summary?: Record<string, unknown>;
};

const verifyBackupPackageIntegrity = async (parsed: ReturnType<typeof parseBackupBody>) => {
  const manifest = parsed.manifest;
  const tables = parsed.tables ?? {};
  const errors: Array<{ code: string; message: string }> = [];
  if (!manifest?.overall_checksum) {
    errors.push({ code: "RESTORE_MANIFEST_INVALID", message: "Backup manifest is missing an overall checksum." });
  } else {
    const actualOverall = await calculateBackupPackageChecksum({ manifest, tables });
    if (actualOverall !== manifest.overall_checksum) errors.push({ code: "RESTORE_CHECKSUM_MISMATCH", message: "Backup package checksum does not match the manifest." });
  }
  const expectedTableChecksums = manifest?.table_checksums ?? {};
  const actualTableChecksums = await calculateTableChecksums(tables);
  for (const table of Object.keys(tables)) {
    if (!expectedTableChecksums[table]) {
      errors.push({ code: "RESTORE_MANIFEST_INVALID", message: `Backup table ${table} is missing a checksum.` });
    } else if (expectedTableChecksums[table] !== actualTableChecksums[table]) {
      errors.push({ code: "RESTORE_CHECKSUM_MISMATCH", message: `Backup table ${table} checksum does not match the manifest.` });
    }
  }
  return { checksumVerified: errors.length === 0, errors };
};

export const createBackup = async (env: Env, context: AuthActor, input: BackupCreateInput) => {
  requireAny(context, ["backup_recovery.backup.create", "backup.create"]);
  const settings = await getSettingsInternal(env, context.companyId);
  if (!settings.backup_enabled || !settings.allow_manual_backup) throw new AppError("Manual backup creation is disabled for this company.", "BACKUP_DISABLED", 403);
  if (input.idempotency_key) {
    const existing = await repository.findBackupByIdempotencyKey(env, context.companyId, input.idempotency_key);
    if (existing) return { backup_job: safeJob(existing), duplicate: true };
  }
  const id = crypto.randomUUID();
  await repository.createBackupJob(env, {
    id,
    companyId: context.companyId,
    backupType: input.backup_type,
    userId: context.actorUserId,
    status: "pending",
    idempotencyKey: input.idempotency_key ?? null,
    metadataJson: JSON.stringify({
      include_audit_logs: input.include_audit_logs === true,
      include_document_metadata: input.include_document_metadata !== false,
      include_notification_history: input.include_notification_history === true,
      reason: input.reason,
    }),
  });
  await audit(env, context, "backup_job_created", "backup_job", id, input.reason, { backup_type: input.backup_type });
  return generateBackup(env, context, id, input.reason);
};

export const generateBackup = async (env: Env, context: AuthActor, id: string, reason?: string) => {
  requireAny(context, ["backup_recovery.backup.generate", "backup_recovery.backup.create", "backup.create"]);
  const settings = await getSettingsInternal(env, context.companyId);
  const job = await repository.findBackup(env, context.companyId, id);
  if (!job) throw new NotFoundError("Backup job not found.");
  if (job.status === "completed") return { backup_job: safeJob(job), already_completed: true };
  if (!["pending", "failed"].includes(job.status)) throw new AppError("This backup job cannot be generated in its current status.", "BACKUP_INVALID_STATUS", 409);
  const claimed = await repository.claimBackupProcessing(env, context.companyId, id);
  if (!claimed) throw new AppError("This backup job is already being processed.", "BACKUP_INVALID_STATUS", 409);
  try {
    const metadata = job.metadata_json ? JSON.parse(job.metadata_json) as Record<string, unknown> : {};
    const snapshot = await buildBackupSnapshot(env, context, job.backup_type, {
      includeAuditLogs: metadata.include_audit_logs === true,
      includeDocumentMetadata: metadata.include_document_metadata !== false,
      includeNotificationHistory: metadata.include_notification_history === true,
      maxRows: settings.max_backup_rows,
    });
    const body = JSON.stringify(snapshot, null, 2);
    if (body.length > settings.max_backup_size) throw new AppError("Backup package exceeds the configured safe size limit.", "BACKUP_TOO_LARGE", 413);
    const checksum = await calculateChecksum(body);
    const stored = await putBackupObject(env, context.companyId, body);
    const inlineContent = stored.fileKey ? null : body;
    if (!stored.fileKey && !inlineContent) throw new AppError("Backup storage is not configured.", "BACKUP_STORAGE_NOT_CONFIGURED", 503);
    const expiresAt = new Date(Date.now() + settings.backup_expiry_days * 24 * 60 * 60 * 1000).toISOString();
    await repository.completeBackupJob(env, context.companyId, id, {
      fileKey: stored.fileKey,
      fileName: stored.fileName,
      fileSize: stored.fileSize,
      checksum,
      manifestJson: JSON.stringify(snapshot.manifest),
      tableCount: snapshot.manifest.included_tables.length,
      rowCount: Object.values(snapshot.manifest.row_counts).reduce((sum, value) => sum + Number(value), 0),
      includedTablesJson: JSON.stringify(snapshot.manifest.included_tables),
      excludedTablesJson: JSON.stringify(snapshot.manifest.excluded_tables),
      redactionSummaryJson: JSON.stringify(snapshot.redaction_summary),
      expiresAt,
      contentJson: inlineContent,
    });
    await audit(env, context, "backup_generated", "backup_job", id, reason, { checksum, table_count: snapshot.manifest.included_tables.length });
    return { backup_job: safeJob(await repository.findBackup(env, context.companyId, id)), manifest: snapshot.manifest };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "BACKUP_GENERATION_FAILED";
    const status = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message.slice(0, 300) : "Backup generation failed.";
    await repository.failBackupJob(env, context.companyId, id, code, message);
    await audit(env, context, "backup_failed", "backup_job", id, reason, { failure_code: code });
    throw new AppError(message || "Backup generation failed safely. Please review the backup job details.", code, status);
  }
};

export const listBackups = (env: Env, context: AuthActor, filters: ListFilters) => {
  requireAny(context, ["backup_recovery.view", "backup.view_history", "backup.view"]);
  return repository.listBackups(env, context.companyId, filters);
};

export const getBackup = async (env: Env, context: AuthActor, id: string) => {
  requireAny(context, ["backup_recovery.view", "backup.view_history", "backup.view"]);
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup) throw new NotFoundError("Backup job not found.");
  return safeJob(backup);
};

export const downloadBackup = async (env: Env, context: AuthActor, id: string) => {
  requireAny(context, ["backup_recovery.backup.download", "backup.download"]);
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup) throw new NotFoundError("Backup job not found.");
  if (backup.status !== "completed") throw new AppError("Only completed backups can be downloaded.", "BACKUP_INVALID_STATUS", 409);
  if (backup.expires_at && new Date(backup.expires_at).getTime() < Date.now()) throw new AppError("This backup download has expired.", "BACKUP_DOWNLOAD_EXPIRED", 410);
  const body = await backupBodyForJob(env, context, backup);
  if (!body.trim()) throw new AppError("Backup content is not available.", "BACKUP_CONTENT_NOT_AVAILABLE", 409);
  await audit(env, context, "backup_downloaded", "backup_job", id, undefined, { checksum: backup.checksum_sha256 ?? await calculateChecksum(body) });
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": safeAttachmentHeader(backup.file_name, `backup-${id}.json`),
      "cache-control": "private, no-store",
    },
  });
};

export const verifyBackup = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const backup = await repository.findBackup(env, context.companyId, id);
  if (!backup) throw new NotFoundError("Backup job not found.");
  const parsed = parseBackupBody(await backupBodyForJob(env, context, backup));
  if (parsed.manifest?.company_id !== context.companyId) throw new AppError("Backup manifest does not match this company.", "RESTORE_COMPANY_MISMATCH", 409);
  if (parsed.manifest?.backup_schema_version !== BACKUP_SCHEMA_VERSION) throw new AppError("Backup schema version is not compatible.", "RESTORE_SCHEMA_INCOMPATIBLE", 409);
  const integrity = await verifyBackupPackageIntegrity(parsed);
  if (!integrity.checksumVerified) throw new AppError(integrity.errors[0]?.message ?? "Backup checksum could not be verified.", integrity.errors[0]?.code ?? "RESTORE_MANIFEST_INVALID", 409);
  await audit(env, context, "backup_verified", "backup_job", id, reason, { checksum: parsed.manifest?.overall_checksum });
  return { backup_job_id: id, verified: true, manifest: parsed.manifest };
};

export const deleteBackup = async (env: Env, context: AuthActor, id: string, reason: string) => {
  requireAny(context, ["backup_recovery.backup.cancel", "backup.manage_settings"]);
  await audit(env, context, "backup_cancelled", "backup_job", id, reason);
  await repository.markBackupDeleted(env, context.companyId, id);
  return { backup_job_id: id, status: "cancelled" };
};

export const cancelBackupJob = deleteBackup;

export const getStatus = async (env: Env, context: AuthActor) => ({
  ...(await repository.latestBackupStatus(env, context.companyId)),
  failed_backup_count: await repository.failedBackupCount(env, context.companyId),
  backup_bucket_configured: Boolean(env.BACKUP_BUCKET),
  backup_settings: await getSettingsInternal(env, context.companyId),
  retention_policy_summary: await retentionService.getRetentionPolicy(env, context.companyId),
  next_scheduled_backup_placeholder: null,
});

export const getRetentionPolicy = (env: Env, context: AuthActor) => retentionService.getRetentionPolicy(env, context.companyId);
export const updateRetentionPolicy = async (env: Env, context: AuthActor, input: RetentionPolicyInput) => {
  const updated = await retentionService.updateRetentionPolicy(env, context.companyId, input);
  await audit(env, context, "backup_retention_policy_updated", "backup_retention_policy", context.companyId, input.reason);
  return updated;
};

export const getBackupRestoreSettings = async (env: Env, context: AuthActor) => {
  requireAny(context, ["backup_recovery.view", "backup.settings.view", "backup_settings.view"]);
  return getSettingsInternal(env, context.companyId);
};

export const updateBackupRestoreSettings = async (env: Env, context: AuthActor, input: BackupRestoreSettingsInput) => {
  requireAny(context, ["backup_recovery.settings.manage", "backup.manage_settings", "backup_settings.manage"]);
  const current = await getSettingsInternal(env, context.companyId);
  const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "reason" && value !== undefined)) };
  await repository.upsertSetting(env, context.companyId, backupSettingsKey, "backup_recovery", JSON.stringify(next));
  await audit(env, context, "backup_restore_settings_changed", "backup_restore_settings", context.companyId, input.reason);
  return next;
};

export const createRestoreRequest = (env: Env, context: AuthActor, input: RestoreRequestInput) => restoreService.createRestoreRequest(env, context, input);
export const listRestoreRequests = (env: Env, context: AuthActor, filters: ListFilters) => restoreService.listRestoreRequests(env, context, filters);
export const getRestoreRequest = (env: Env, context: AuthActor, id: string) => restoreService.getRestoreRequest(env, context, id);
export const approveRestoreRequest = (env: Env, context: AuthActor, id: string, reason: string) => restoreService.updateRestoreRequest(env, context, id, "approved", reason);
export const rejectRestoreRequest = (env: Env, context: AuthActor, id: string, reason: string) => restoreService.updateRestoreRequest(env, context, id, "rejected", reason);

export const createRestoreJob = async (env: Env, context: AuthActor, input: RestoreJobInput) => {
  requireAny(context, ["backup_recovery.restore.create", "backup.restore_request"], "RESTORE_PERMISSION_DENIED");
  const settings = await getSettingsInternal(env, context.companyId);
  if (!settings.allow_restore_preview) throw new AppError("Restore preview is disabled for this company.", "RESTORE_DISABLED", 403);
  if (input.restore_mode === "replace_company_data" && !context.isSuperAdmin) throw new AppError("Replace-company restore requires Super Admin.", "RESTORE_MODE_NOT_ALLOWED", 403);
  const id = crypto.randomUUID();
  const backup = input.backup_job_id ? await repository.findBackup(env, context.companyId, input.backup_job_id) : null;
  if (input.backup_job_id && !backup) throw new NotFoundError("Backup job not found.");
  await repository.createRestoreJob(env, { id, companyId: context.companyId, backupJobId: input.backup_job_id, sourceFileName: backup?.file_name ?? null, restoreMode: input.restore_mode, userId: context.actorUserId, metadataJson: JSON.stringify({ reason: input.reason }) });
  await audit(env, context, "restore_job_created", "restore_job", id, input.reason, { restore_mode: input.restore_mode, backup_job_id: input.backup_job_id });
  return { restore_job: await repository.findRestoreJob(env, context.companyId, id) };
};

const loadRestorePackage = async (env: Env, context: AuthActor, restoreJob: any) => {
  const backup = restoreJob.backup_job_id ? await repository.findBackup(env, context.companyId, restoreJob.backup_job_id) : null;
  if (!backup) throw new AppError("Restore job must reference a completed backup.", "BACKUP_NOT_FOUND", 404);
  if (backup.status !== "completed") throw new AppError("Restore can only use completed backups.", "RESTORE_INVALID_STATUS", 409);
  const parsed = parseBackupBody(await backupBodyForJob(env, context, backup));
  return { backup, parsed };
};

export const validateRestoreJob = async (env: Env, context: AuthActor, id: string) => {
  requireAny(context, ["backup_recovery.restore.preview", "backup.restore_request"], "RESTORE_PERMISSION_DENIED");
  const restoreJob = await repository.findRestoreJob(env, context.companyId, id);
  if (!restoreJob) throw new NotFoundError("Restore job not found.");
  if (!["uploaded", "validation_failed", "preview_ready"].includes(restoreJob.status)) throw new AppError("Restore job cannot be validated in its current status.", "RESTORE_INVALID_STATUS", 409);
  const { parsed } = await loadRestorePackage(env, context, restoreJob);
  const manifest = parsed.manifest;
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: string[] = [];
  if (!manifest || manifest.backup_schema_version !== BACKUP_SCHEMA_VERSION) errors.push({ code: "RESTORE_SCHEMA_INCOMPATIBLE", message: "Backup schema version is not compatible." });
  if (manifest?.company_id !== context.companyId) errors.push({ code: "RESTORE_COMPANY_MISMATCH", message: "Backup company does not match current company." });
  const integrity = await verifyBackupPackageIntegrity(parsed);
  errors.push(...integrity.errors);
  if (restoreJob.restore_mode === "replace_company_data" || (!["dry_run", ...SUPPORTED_APPLY_MODES].includes(restoreJob.restore_mode))) {
    errors.push({ code: "RESTORE_MODE_NOT_ALLOWED", message: "This restore mode is not supported by the current safe restore implementation." });
  }
  const tables = parsed.tables ?? {};
  const tableNames = Object.keys(tables);
  let restorableRows = 0;
  let skippedUnsupportedRows = 0;
  let blockedRows = 0;
  const rows = tableNames.flatMap((tableName, tableIndex) => {
    const tableRows = tables[tableName]?.rows ?? [];
    return tableRows.slice(0, 25).map((row: any, index: number) => ({
      id: `${id}:${tableName}:${index}`,
      tableName,
      rowNumber: index + 1,
      sourceId: row?.id ? String(row.id) : null,
      targetId: row?.id ? String(row.id) : null,
      ...(() => {
        if (errors.length) {
          blockedRows += 1;
          return { status: "invalid", action: "blocked", errorCode: errors[0]?.code ?? null, errorMessage: errors[0]?.message ?? null };
        }
        if (!SUPPORTED_RESTORE_TABLES.has(tableName)) {
          skippedUnsupportedRows += 1;
          return { status: "skipped", action: "skip", errorCode: "RESTORE_TABLE_UNSUPPORTED", errorMessage: `Table ${tableName} is not supported for restore apply yet.` };
        }
        if (restoreJob.restore_mode === "dry_run") {
          return { status: "valid", action: "skip", errorCode: null, errorMessage: null };
        }
        restorableRows += 1;
        return { status: "valid", action: restoreJob.restore_mode === "insert_missing" ? "insert" : "update", errorCode: null, errorMessage: null };
      })(),
      warningsJson: tableIndex === 0 && restoreJob.restore_mode !== "dry_run" ? JSON.stringify(["Restore apply requires typed confirmation."]) : null,
    }));
  });
  if (skippedUnsupportedRows > 0) warnings.push(`${skippedUnsupportedRows} rows are from tables that are not supported for restore apply yet.`);
  await repository.replaceRestoreRows(env, context.companyId, id, rows);
  await repository.markRestoreValidated(env, context.companyId, id, {
    status: errors.length ? "validation_failed" : "preview_ready",
    totalTables: tableNames.length,
    totalRows: Object.values(manifest?.row_counts ?? {}).reduce((sum: number, value) => sum + Number(value), 0),
    validRows: restorableRows,
    invalidRows: blockedRows,
    conflictRows: skippedUnsupportedRows,
    checksumVerified: integrity.checksumVerified ? 1 : 0,
    manifestVerified: errors.length ? 0 : 1,
    failureCode: errors[0]?.code,
    failureMessage: errors[0]?.message,
  });
  await audit(env, context, "restore_validated", "restore_job", id, undefined, { errors: errors.length, tables: tableNames.length });
  return {
    restore_job: await repository.findRestoreJob(env, context.companyId, id),
    summary: {
      tables: tableNames.length,
      restorable_rows: restorableRows,
      skipped_unsupported_rows: skippedUnsupportedRows,
      blocked_rows: blockedRows,
      warnings,
      errors,
    },
    tables: tableNames,
    errors,
  };
};

export const previewRestoreJob = validateRestoreJob;

export const applyRestoreJob = async (env: Env, context: AuthActor, id: string, input: RestoreApplyInput) => {
  requireAny(context, ["backup_recovery.restore.apply"], "RESTORE_PERMISSION_DENIED");
  const settings = await getSettingsInternal(env, context.companyId);
  if (!settings.allow_restore_apply) throw new AppError("Restore apply is disabled for this company.", "RESTORE_DISABLED", 403);
  if (settings.require_super_admin_for_restore && !context.isSuperAdmin) throw new AppError("Restore apply requires Super Admin.", "RESTORE_PERMISSION_DENIED", 403);
  if (input.confirmation !== RESTORE_CONFIRMATION_PHRASE) throw new AppError("Typed confirmation is required before restore can run.", "RESTORE_CONFIRMATION_REQUIRED", 400);
  const restoreJob = await repository.findRestoreJob(env, context.companyId, id);
  if (!restoreJob) throw new NotFoundError("Restore job not found.");
  if (restoreJob.restore_mode === "dry_run") throw new AppError("Dry-run restore jobs cannot apply changes.", "RESTORE_MODE_NOT_ALLOWED", 409);
  if (!SUPPORTED_APPLY_MODES.has(restoreJob.restore_mode)) throw new AppError("This restore mode is not supported by the current safe restore implementation.", "RESTORE_MODE_NOT_ALLOWED", 409);
  const claimed = await repository.claimRestoreApplying(env, context.companyId, id);
  if (!claimed) throw new AppError("Restore job cannot be applied in its current status.", "RESTORE_INVALID_STATUS", 409);
  try {
    const { parsed } = await loadRestorePackage(env, context, restoreJob);
    const integrity = await verifyBackupPackageIntegrity(parsed);
    if (!integrity.checksumVerified) throw new AppError(integrity.errors[0]?.message ?? "Backup checksum could not be verified.", integrity.errors[0]?.code ?? "RESTORE_MANIFEST_INVALID", 409);
    let restoredRows = 0;
    let skippedRows = 0;
    for (const tableName of Object.keys(parsed.tables ?? {})) {
    const rows = parsed.tables?.[tableName]?.rows ?? [];
      if (!SUPPORTED_RESTORE_TABLES.has(tableName)) {
        skippedRows += rows.length;
        continue;
      }
      for (const row of rows) {
        const columns = Object.keys(row).filter((key) => !/password|token|secret|hash|totp|backup_code/i.test(key));
        if (!columns.length) continue;
        const placeholders = columns.map(() => "?").join(", ");
        const sql = restoreJob.restore_mode === "insert_missing"
          ? `INSERT OR IGNORE INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`
          : `INSERT OR REPLACE INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
        await env.DB.prepare(sql).bind(...columns.map((key) => row[key])).run();
        restoredRows += 1;
      }
    }
    await repository.completeRestoreJob(env, context.companyId, id, { status: "completed", restoredRows, skippedRows, failedRows: 0 });
    await audit(env, context, "restore_applied", "restore_job", id, input.reason, { restore_mode: restoreJob.restore_mode, restored_rows: restoredRows, skipped_rows: skippedRows });
    return { restore_job: await repository.findRestoreJob(env, context.companyId, id), summary: { restored_rows: restoredRows, skipped_rows: skippedRows, failed_rows: 0 } };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "RESTORE_APPLY_FAILED";
    const message = error instanceof Error ? error.message.slice(0, 300) : "Restore apply failed.";
    await repository.completeRestoreJob(env, context.companyId, id, { status: "failed", restoredRows: 0, skippedRows: 0, failedRows: 1, failureCode: code, failureMessage: message });
    await audit(env, context, "restore_failed", "restore_job", id, input.reason, { failure_code: code });
    if (error instanceof AppError) throw error;
    throw new AppError(message, code, 500);
  }
};

export const cancelRestoreJob = async (env: Env, context: AuthActor, id: string, reason: string) => {
  requireAny(context, ["backup_recovery.restore.cancel", "backup.restore_approve"], "RESTORE_PERMISSION_DENIED");
  await repository.cancelRestoreJob(env, context.companyId, id);
  await audit(env, context, "restore_cancelled", "restore_job", id, reason);
  return { restore_job_id: id, status: "cancelled" };
};

export const listRestoreJobs = (env: Env, context: AuthActor, filters: ListFilters) => {
  requireAny(context, ["backup_recovery.restore.preview", "backup.restore_request"], "RESTORE_PERMISSION_DENIED");
  return repository.listRestoreJobs(env, context.companyId, filters);
};

export const getRestoreJob = async (env: Env, context: AuthActor, id: string) => {
  requireAny(context, ["backup_recovery.restore.preview", "backup.restore_request"], "RESTORE_PERMISSION_DENIED");
  const restoreJob = await repository.findRestoreJob(env, context.companyId, id);
  if (!restoreJob) throw new NotFoundError("Restore job not found.");
  return restoreJob;
};
