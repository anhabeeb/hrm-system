import { z } from "zod";
import { AppError, ValidationError } from "../../utils/errors";
import { ARCHIVE_JOB_STATUSES, ARCHIVE_SOURCE_TYPES } from "./data-retention.constants";
import type { ArchiveApplyInput, ArchiveItemActionInput, ArchiveListFilters, ArchivePreviewInput, RetentionSettingsInput } from "./data-retention.types";

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);
const sourceEnum = z.enum(ARCHIVE_SOURCE_TYPES);
const itemStatuses = ["pending", "eligible", "blocked", "archived", "restored", "skipped", "failed"] as const;

export const validateRetentionSettings = (payload: unknown): RetentionSettingsInput => {
  const result = z.object({
    enabled: z.boolean().optional(),
    default_retention_months: z.coerce.number().int().min(1).max(240).optional(),
    archive_only_mode: z.boolean().optional(),
    purge_enabled: z.boolean().optional(),
    require_backup_before_archive: z.boolean().optional(),
    backup_required_max_age_days: z.coerce.number().int().min(1).max(365).optional(),
    active_attendance_window_days: z.coerce.number().int().min(1).max(730).optional(),
    include_archived_records_in_reports_by_default: z.boolean().optional(),
    allow_restore_from_archive: z.boolean().optional(),
    source_retention_months: z.record(z.coerce.number().int().min(1).max(240)).optional(),
    reason: z.string().trim().min(3, "A reason is required for retention settings changes.").max(500),
  }).safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review retention settings.");
  if (result.data.purge_enabled) throw new AppError("Permanent purge is disabled in this phase.", "ARCHIVE_PURGE_DISABLED", 403);
  return result.data;
};

export const validateArchiveListFilters = (query: Record<string, string | undefined>): ArchiveListFilters => {
  const result = z.object({
    source_type: z.string().optional(),
    status: z.string().optional(),
    requested_by: z.string().optional(),
    page,
    page_size: pageSize,
  }).safeParse(query);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review archive filters.");
  if (result.data.source_type && !(ARCHIVE_SOURCE_TYPES as readonly string[]).includes(result.data.source_type)) throw new AppError("Please choose a supported archive source.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  if (result.data.status && !(ARCHIVE_JOB_STATUSES as readonly string[]).includes(result.data.status)) throw new AppError("Please choose a valid archive status.", "ARCHIVE_INVALID_STATUS", 400);
  return result.data;
};

export const validateArchiveItemFilters = (query: Record<string, string | undefined>) => {
  const result = z.object({
    status: z.string().optional(),
    page,
    page_size: pageSize,
  }).safeParse(query);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review archive item filters.");
  if (result.data.status && !(itemStatuses as readonly string[]).includes(result.data.status)) throw new AppError("Please choose a valid archive item status.", "ARCHIVE_INVALID_STATUS", 400);
  return result.data;
};

export const validateArchivePreview = (payload: unknown): ArchivePreviewInput => {
  const result = z.object({
    source_type: sourceEnum,
    cutoff_date: z.string().trim().optional(),
    retention_months: z.coerce.number().int().min(1).max(240).optional(),
    page_size: pageSize,
    reason: z.string().trim().max(500).optional(),
    idempotency_key: z.string().trim().max(255).optional(),
  }).safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review archive preview details.");
  return result.data;
};

export const validateArchiveApply = (payload: unknown): ArchiveApplyInput => {
  const result = z.object({
    confirmation: z.string().trim(),
    reason: z.string().trim().min(3, "A reason is required before archiving data.").max(500),
  }).safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review archive confirmation.");
  return result.data;
};

export const validateArchiveItemAction = (payload: unknown): ArchiveItemActionInput => {
  const result = z.object({
    reason: z.string().trim().min(3, "A reason is required.").max(500),
  }).safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please provide a reason.");
  return result.data;
};
