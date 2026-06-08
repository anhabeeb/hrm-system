import { ValidationError } from "../../utils/errors";
import { BACKUP_TYPES, RESTORE_SCOPES, RESTORE_MODES } from "./backup-recovery.constants";
import type { BackupCreateInput, BackupRestoreSettingsInput, ListFilters, RestoreApplyInput, RestoreJobInput, RestoreRequestInput, RetentionPolicyInput } from "./backup-recovery.types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asBool = (value: unknown) => value === true || value === "true" ? true : value === false || value === "false" ? false : undefined;
const reason = (payload: Record<string, unknown>) => {
  const parsed = asString(payload.reason);
  if (!parsed || parsed.length < 3) throw new ValidationError("A reason is required for this action.");
  return parsed;
};

export const validateList = (query: Record<string, unknown>): ListFilters => ({
  status: asString(query.status),
  type: asString(query.type),
  page: Math.max(1, Math.trunc(asNumber(query.page) ?? 1)),
  page_size: Math.min(100, Math.max(1, Math.trunc(asNumber(query.page_size) ?? 25))),
});

export const validateBackupCreate = (payload: unknown): BackupCreateInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const backupType = asString(payload.backup_type) ?? "company_data";
  if (!(BACKUP_TYPES as readonly string[]).includes(backupType)) throw new ValidationError("Please select a valid backup type.");
  return {
    backup_type: backupType,
    include_audit_logs: asBool(payload.include_audit_logs),
    include_document_metadata: asBool(payload.include_document_metadata),
    include_notification_history: asBool(payload.include_notification_history),
    idempotency_key: asString(payload.idempotency_key),
    reason: reason(payload),
  };
};

export const validateReason = (payload: unknown) => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  return { reason: reason(payload) };
};

export const validateRestoreRequest = (payload: unknown): RestoreRequestInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const scope = asString(payload.restore_scope) ?? asString(payload.restore_mode) ?? "dry_run";
  if (!(RESTORE_SCOPES as readonly string[]).includes(scope)) throw new ValidationError("Please select a valid restore scope.");
  return { backup_id: asString(payload.backup_id) ?? asString(payload.backup_job_id), restore_scope: scope, restore_mode: asString(payload.restore_mode) ?? scope, confirmation: asString(payload.confirmation), reason: reason(payload) };
};

export const validateRestoreJobCreate = (payload: unknown): RestoreJobInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const mode = asString(payload.restore_mode) ?? "dry_run";
  if (!(RESTORE_MODES as readonly string[]).includes(mode)) throw new ValidationError("Please select a valid restore mode.");
  return { backup_job_id: asString(payload.backup_job_id) ?? asString(payload.backup_id), restore_mode: mode, reason: reason(payload) };
};

export const validateRestoreApply = (payload: unknown): RestoreApplyInput => {
  if (!isObject(payload)) throw new ValidationError("A reason and typed confirmation are required.");
  const confirmation = asString(payload.confirmation);
  if (!confirmation) throw new ValidationError("Typed confirmation is required before restore can run.");
  return { confirmation, reason: reason(payload) };
};

export const validateRetentionPolicy = (payload: unknown): RetentionPolicyInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const positive = (value: unknown) => {
    const parsed = asNumber(value);
    return parsed === undefined ? undefined : Math.max(0, Math.trunc(parsed));
  };
  return {
    retention_days: positive(payload.retention_days),
    keep_monthly_count: positive(payload.keep_monthly_count),
    keep_yearly_count: positive(payload.keep_yearly_count),
    auto_delete_enabled: asBool(payload.auto_delete_enabled),
    reason: reason(payload),
  };
};

export const validateBackupRestoreSettings = (payload: unknown): BackupRestoreSettingsInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const positive = (value: unknown) => {
    const parsed = asNumber(value);
    return parsed === undefined ? undefined : Math.max(0, Math.trunc(parsed));
  };
  return {
    backup_enabled: asBool(payload.backup_enabled),
    backup_expiry_days: positive(payload.backup_expiry_days),
    max_backup_rows: positive(payload.max_backup_rows),
    max_backup_size: positive(payload.max_backup_size),
    allow_manual_backup: asBool(payload.allow_manual_backup),
    allow_restore_preview: asBool(payload.allow_restore_preview),
    allow_restore_apply: asBool(payload.allow_restore_apply),
    require_super_admin_for_restore: asBool(payload.require_super_admin_for_restore),
    include_audit_logs: asBool(payload.include_audit_logs),
    include_notification_history: asBool(payload.include_notification_history),
    include_import_export_history: asBool(payload.include_import_export_history),
    include_document_metadata: asBool(payload.include_document_metadata),
    include_document_file_manifest: asBool(payload.include_document_file_manifest),
    reason: reason(payload),
  };
};
