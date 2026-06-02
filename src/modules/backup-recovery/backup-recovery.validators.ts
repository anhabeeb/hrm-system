import { ValidationError } from "../../utils/errors";
import { BACKUP_TYPES, RESTORE_SCOPES } from "./backup-recovery.constants";
import type { BackupCreateInput, ListFilters, RestoreRequestInput, RetentionPolicyInput } from "./backup-recovery.types";

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
  const backupType = asString(payload.backup_type) ?? "metadata";
  if (!(BACKUP_TYPES as readonly string[]).includes(backupType)) throw new ValidationError("Please select a valid backup type.");
  return { backup_type: backupType, reason: reason(payload) };
};

export const validateReason = (payload: unknown) => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  return { reason: reason(payload) };
};

export const validateRestoreRequest = (payload: unknown): RestoreRequestInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  const scope = asString(payload.restore_scope) ?? "metadata_preview";
  if (!(RESTORE_SCOPES as readonly string[]).includes(scope)) throw new ValidationError("Please select a valid restore scope.");
  return { backup_id: asString(payload.backup_id), restore_scope: scope, reason: reason(payload) };
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
