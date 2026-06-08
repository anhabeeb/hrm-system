import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { AppError, NotFoundError, PermissionError } from "../../utils/errors";
import { ARCHIVE_CONFIRMATION_PHRASE, DATA_RETENTION_SETTINGS_KEY, DEFAULT_DATA_RETENTION_SETTINGS } from "./data-retention.constants";
import * as repository from "./data-retention.repository";
import type { ArchiveApplyInput, ArchiveCandidate, ArchiveItemActionInput, ArchiveListFilters, ArchivePreviewInput, ArchiveSourceType, RetentionSettingsInput } from "./data-retention.types";

const audit = async (env: Env, context: AuthActor, action: string, entityType: string, entityId: string, reason?: string, details?: Record<string, unknown>) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "data_retention",
    action,
    severity: action.includes("failed") ? "high" : "info",
    entityType,
    entityId,
    actorId: context.actorUserId,
    reason,
    details,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

const hasAny = (context: AuthActor, permissions: string[]) =>
  context.isSuperAdmin || context.isAdmin || permissionService.hasAnyPermission(context, permissions);

const requireAny = (context: AuthActor, permissions: string[], code = "ARCHIVE_PERMISSION_DENIED") => {
  if (!hasAny(context, permissions)) throw new PermissionError("You do not have permission to manage data retention.", code);
};

const safeJob = (job: any) => {
  if (!job) return job;
  const { metadata_json: _metadata, filters_json, confirmation_hash: _confirmationHash, ...safe } = job;
  return {
    ...safe,
    filters: filters_json ? safeParse(filters_json) : {},
    purge_disabled: true,
  };
};

const safeParse = (json: string) => {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const cutoffFromMonths = (months: number) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
};

const settingsForSource = (settings: Record<string, any>, sourceType: string) => {
  const sourceSettings = settings.source_retention_months ?? {};
  return Number(sourceSettings[sourceType] ?? settings.default_retention_months ?? DEFAULT_DATA_RETENTION_SETTINGS.default_retention_months);
};

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
};

const datePart = (value?: string | null) => String(value ?? "").slice(0, 10);

const ensureBackupRequirement = async (env: Env, context: AuthActor, settings: Record<string, any>) => {
  if (settings.require_backup_before_archive !== true) return;
  const minCompletedAt = isoDaysAgo(Number(settings.backup_required_max_age_days ?? DEFAULT_DATA_RETENTION_SETTINGS.backup_required_max_age_days));
  const backup = await repository.findRecentValidBackup(env, context.companyId, new Date().toISOString(), minCompletedAt);
  if (!backup) throw new AppError("A recent completed backup is required before archiving data.", "ARCHIVE_BACKUP_REQUIRED", 409);
};

const getSettingsInternal = async (env: Env, companyId: string) => {
  const row = await repository.getSetting(env, companyId, DATA_RETENTION_SETTINGS_KEY);
  const stored = row?.setting_value_json ? safeParse(row.setting_value_json) : {};
  return {
    ...DEFAULT_DATA_RETENTION_SETTINGS,
    ...stored,
    purge_enabled: false,
    archive_only_mode: true,
    confirmation_phrase: ARCHIVE_CONFIRMATION_PHRASE,
  };
};

export const getSettings = async (env: Env, context: AuthActor) => {
  requireAny(context, ["data_retention.view", "data_retention.settings.manage"]);
  return getSettingsInternal(env, context.companyId);
};

export const updateSettings = async (env: Env, context: AuthActor, input: RetentionSettingsInput) => {
  requireAny(context, ["data_retention.settings.manage"]);
  if (input.purge_enabled) throw new AppError("Permanent purge is disabled in Phase 12C.", "ARCHIVE_PURGE_DISABLED", 403);
  const current = await getSettingsInternal(env, context.companyId);
  const next = {
    ...current,
    ...input,
    purge_enabled: false,
    archive_only_mode: true,
    reason: undefined,
    updated_by: context.actorUserId,
    updated_at: new Date().toISOString(),
  };
  await repository.upsertSetting(env, context.companyId, DATA_RETENTION_SETTINGS_KEY, JSON.stringify(next));
  await audit(env, context, "retention_settings_changed", "data_retention_settings", context.companyId, input.reason, {
    purge_enabled: false,
    default_retention_months: next.default_retention_months,
  });
  return next;
};

export const listArchiveJobs = async (env: Env, context: AuthActor, filters: ArchiveListFilters) => {
  requireAny(context, ["data_retention.view", "data_retention.audit.view"]);
  const jobs = await repository.listArchiveJobs(env, context.companyId, filters);
  return {
    data: jobs.map(safeJob),
    filters,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total: jobs.length,
      total_pages: Math.max(1, Math.ceil(jobs.length / filters.page_size)),
    },
    generated_at: new Date().toISOString(),
  };
};

export const getArchiveJob = async (env: Env, context: AuthActor, id: string) => {
  requireAny(context, ["data_retention.view", "data_retention.audit.view"]);
  const job = await repository.findArchiveJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("The archive job could not be found.");
  return safeJob(job);
};

const applyOutletScope = (context: AuthActor, candidates: ArchiveCandidate[]) => {
  if (context.isSuperAdmin || context.isAdmin || context.outletIds.length === 0) return candidates;
  return candidates.filter((candidate) => !candidate.outletId || context.outletIds.includes(candidate.outletId));
};

const itemFromCandidate = (candidate: ArchiveCandidate, jobId: string) => ({
  id: `${jobId}_${candidate.sourceTable}_${candidate.id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
  sourceType: candidate.sourceType,
  sourceTable: candidate.sourceTable,
  sourceId: candidate.id,
  employeeId: candidate.employeeId,
  outletId: candidate.outletId,
  departmentId: candidate.departmentId,
  action: candidate.eligible ? "archive" : "block",
  status: candidate.eligible ? "eligible" : "blocked",
  blockedReason: candidate.blockedReason,
  warningCode: candidate.warningCode,
  warningMessage: candidate.warningMessage,
  previousStatus: candidate.status,
  newStatus: candidate.eligible ? "archived" : null,
});

const blockCandidate = (candidate: ArchiveCandidate, blockedReason: string): ArchiveCandidate => ({
  ...candidate,
  eligible: false,
  blockedReason,
});

const activeAttendanceWindowBlocker = (settings: Record<string, any>, eventDate: string | null) => {
  if (!eventDate) return "Attendance date could not be resolved.";
  const cutoff = isoDaysAgo(Number(settings.active_attendance_window_days ?? DEFAULT_DATA_RETENTION_SETTINGS.active_attendance_window_days)).slice(0, 10);
  return eventDate >= cutoff ? "Attendance date is inside the active payroll/attendance retention window." : null;
};

const validateCandidateForPreview = async (env: Env, context: AuthActor, candidate: ArchiveCandidate, settings: Record<string, any>) => {
  if (!candidate.eligible) return candidate;
  if (candidate.sourceType === "employees") {
    const dependencyBlocker = await repository.getEmployeeArchiveBlocker(env, context.companyId, candidate.id);
    return dependencyBlocker ? blockCandidate(candidate, dependencyBlocker) : candidate;
  }
  if (candidate.sourceType === "attendance") {
    const eventDate = datePart(candidate.dateValue);
    const activeWindowBlocker = activeAttendanceWindowBlocker(settings, eventDate);
    if (activeWindowBlocker) return blockCandidate(candidate, activeWindowBlocker);
    const blocker = await repository.getAttendanceArchiveBlocker(env, context.companyId, candidate.employeeId, candidate.id, eventDate);
    return blocker ? blockCandidate(candidate, blocker) : candidate;
  }
  if (candidate.sourceType === "biometric_logs") {
    const unresolvedStatuses = new Set(["unmatched", "ambiguous", "invalid", "pending", "manual_review", "review_required", "unmatched_employee", "ambiguous_employee", "invalid_timestamp"]);
    if (candidate.status && unresolvedStatuses.has(candidate.status)) return blockCandidate(candidate, "Biometric punch review is unresolved.");
    const blocker = await repository.getBiometricArchiveBlocker(env, context.companyId, candidate.employeeId, datePart(candidate.dateValue));
    return blocker ? blockCandidate(candidate, blocker) : candidate;
  }
  return candidate;
};

export const previewArchive = async (env: Env, context: AuthActor, input: ArchivePreviewInput) => {
  requireAny(context, ["data_retention.preview"]);
  const settings = await getSettingsInternal(env, context.companyId);
  if (settings.enabled === false) throw new AppError("Data retention is disabled for this company.", "DATA_RETENTION_DISABLED", 403);
  if (input.source_type === "mixed") throw new AppError("Mixed archive preview is not supported yet. Choose one source type.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  if (input.idempotency_key) {
    const existing = await repository.findArchiveJobByIdempotencyKey(env, context.companyId, input.idempotency_key);
    if (existing) return { job: safeJob(existing), duplicate: true };
  }
  const retentionMonths = input.retention_months ?? settingsForSource(settings, input.source_type);
  const cutoffDate = input.cutoff_date ?? cutoffFromMonths(retentionMonths);
  const jobId = crypto.randomUUID();
  await repository.createArchiveJob(env, {
    id: jobId,
    companyId: context.companyId,
    archiveType: "preview",
    sourceType: input.source_type,
    requestedBy: context.actorUserId,
    reason: input.reason ?? null,
    idempotencyKey: input.idempotency_key ?? null,
    filtersJson: JSON.stringify({ ...input, cutoff_date: cutoffDate, retention_months: retentionMonths }),
  });
  const rawCandidates = applyOutletScope(context, await repository.findArchiveCandidates(env, context.companyId, input.source_type, cutoffDate, input.page_size));
  const candidates = await Promise.all(rawCandidates.map((candidate) => validateCandidateForPreview(env, context, candidate, settings)));
  const items = candidates.map((candidate) => itemFromCandidate(candidate, jobId));
  await repository.replaceArchiveItems(env, context.companyId, jobId, items);
  const eligible = items.filter((item) => item.status === "eligible").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  await repository.markPreviewReady(env, context.companyId, jobId, { total: items.length, eligible, blocked });
  const job = await repository.findArchiveJob(env, context.companyId, jobId);
  await audit(env, context, "archive_preview_created", "archive_job", jobId, input.reason, {
    source_type: input.source_type,
    candidate_count: items.length,
    eligible_count: eligible,
    blocked_count: blocked,
    preview_read_only: true,
  });
  return {
    job: safeJob(job),
    summary: { total_candidates: items.length, eligible_count: eligible, blocked_count: blocked, purge_disabled: true },
    meta: { limited_preview: rawCandidates.length >= input.page_size, preview_limit: input.page_size, total_estimate: null },
    samples: items.slice(0, 25),
    warnings: input.source_type === "audit_logs" ? ["Audit logs are archive-view-only in Phase 12C and remain queryable."] : [],
    blocked_reasons: [...new Set(items.map((item) => item.blockedReason).filter(Boolean))],
    generated_at: new Date().toISOString(),
  };
};

const revalidateItemForArchive = async (env: Env, companyId: string, item: any, settings: Record<string, any>) => {
  const row = await repository.findItemSourceRow(env, companyId, item.source_table, item.source_id);
  if (!row) return { ok: false, reason: "Source record no longer exists." };
  if (row.archived_at) return { ok: false, reason: "Source record is already archived.", alreadyArchived: true };
  const status = row.status ?? row.employment_status;
  if (item.source_type === "employees") {
    if (!["terminated", "resigned", "offboarded", "inactive", "archived"].includes(status)) return { ok: false, reason: "Employee became active after preview." };
    const dependencyBlocker = await repository.getEmployeeArchiveBlocker(env, companyId, item.source_id);
    if (dependencyBlocker) return { ok: false, reason: dependencyBlocker };
  }
  if (item.source_type === "attendance") {
    const eventDate = datePart(row.event_time);
    const activeWindowBlocker = activeAttendanceWindowBlocker(settings, eventDate);
    if (activeWindowBlocker) return { ok: false, reason: activeWindowBlocker };
    const blocker = await repository.getAttendanceArchiveBlocker(env, companyId, row.employee_id ?? null, item.source_id, eventDate);
    if (blocker) return { ok: false, reason: blocker };
  }
  if (item.source_type === "biometric_logs") {
    const unresolvedStatuses = new Set(["unmatched", "ambiguous", "invalid", "pending", "manual_review", "review_required", "unmatched_employee", "ambiguous_employee", "invalid_timestamp"]);
    if (status && unresolvedStatuses.has(status)) return { ok: false, reason: "Biometric punch review is unresolved." };
    const blocker = await repository.getBiometricArchiveBlocker(env, companyId, row.employee_id ?? null, datePart(row.event_time));
    if (blocker) return { ok: false, reason: blocker };
  }
  if (item.source_type === "leave" && !["approved", "completed", "rejected", "cancelled"].includes(status)) return { ok: false, reason: "Leave request is open or pending." };
  if (item.source_type === "long_leave" && !["completed", "returned", "cancelled", "rejected"].includes(status)) return { ok: false, reason: "Long leave record is open." };
  if (item.source_type === "payroll" && !["finalized", "paid", "locked"].includes(status)) return { ok: false, reason: "Payroll run is draft or open." };
  if (item.source_type === "expiry_alerts" && !["resolved", "dismissed", "archived"].includes(status)) return { ok: false, reason: "Expiry alert is still open." };
  if (item.source_type === "audit_logs") return { ok: false, reason: "Audit logs cannot be archived in this phase." };
  return { ok: true, reason: null };
};

export const applyArchiveJob = async (env: Env, context: AuthActor, id: string, input: ArchiveApplyInput) => {
  requireAny(context, ["data_retention.archive"]);
  if (input.confirmation !== ARCHIVE_CONFIRMATION_PHRASE) throw new AppError("Type ARCHIVE DATA to confirm this archive job.", "ARCHIVE_CONFIRMATION_REQUIRED", 400);
  if (!input.reason?.trim()) throw new AppError("A reason is required before archiving data.", "ARCHIVE_REASON_REQUIRED", 400);
  const settings = await getSettingsInternal(env, context.companyId);
  const job = await repository.findArchiveJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("The archive job could not be found.");
  if (["completed", "partially_completed"].includes(job.status)) {
    return {
      job: safeJob(job),
      summary: {
        archived_count: Number(job.archived_count ?? 0),
        skipped_count: Number(job.skipped_count ?? 0),
        blocked_count: Number(job.blocked_count ?? 0),
        failed_count: Number(job.failed_count ?? 0),
      },
      already_applied: true,
    };
  }
  if (job.status !== "preview_ready") throw new AppError("Only preview-ready archive jobs can be applied.", "ARCHIVE_INVALID_STATUS", 409);
  await ensureBackupRequirement(env, context, settings);
  const claimed = await repository.claimArchiveProcessing(env, context.companyId, id);
  if (!claimed) throw new AppError("This archive job is already being processed or is no longer ready.", "ARCHIVE_INVALID_STATUS", 409);
  let archived = 0;
  let skipped = 0;
  let failed = 0;
  let blocked = Number(job.blocked_count ?? 0);
  try {
    const items = await repository.listArchiveItems(env, context.companyId, id, { status: "eligible", page: 1, page_size: 100 });
    for (const item of items) {
      const check = await revalidateItemForArchive(env, context.companyId, item, settings);
      if (!check.ok) {
        const status = check.alreadyArchived ? "skipped" : "blocked";
        if (status === "skipped") skipped += 1; else blocked += 1;
        await repository.updateArchiveItemOutcome(env, context.companyId, item.id, { status, blockedReason: check.reason });
        continue;
      }
      const result = await repository.archiveSourceRow(env, context.companyId, item.source_table, item.source_id, context.actorUserId, input.reason);
      const changed = result.meta?.changes ?? 0;
      if (changed > 0) {
        archived += 1;
        await repository.updateArchiveItemOutcome(env, context.companyId, item.id, { status: "archived", newStatus: "archived" });
        await audit(env, context, "archive_item_archived", item.source_type, item.source_id, input.reason, { archive_job_id: id });
      } else {
        skipped += 1;
        await repository.updateArchiveItemOutcome(env, context.companyId, item.id, { status: "skipped", blockedReason: "Record was already archived or changed." });
      }
    }
    const finalStatus = failed > 0 || blocked > Number(job.blocked_count ?? 0) ? "partially_completed" : "completed";
    await repository.completeArchiveJob(env, context.companyId, id, { status: finalStatus, archived, restored: 0, skipped, failed, blocked });
    await audit(env, context, "archive_applied", "archive_job", id, input.reason, { archived_count: archived, skipped_count: skipped, blocked_count: blocked });
    return {
      job: safeJob(await repository.findArchiveJob(env, context.companyId, id)),
      summary: { archived_count: archived, skipped_count: skipped, blocked_count: blocked, failed_count: failed },
    };
  } catch (error) {
    failed += 1;
    await repository.failArchiveJob(env, context.companyId, id, "ARCHIVE_APPLY_FAILED", error instanceof Error ? error.message : "Archive apply failed.");
    await audit(env, context, "archive_job_failed", "archive_job", id, input.reason, { failure_code: "ARCHIVE_APPLY_FAILED" });
    throw error;
  }
};

export const cancelArchiveJob = async (env: Env, context: AuthActor, id: string, reason: string) => {
  requireAny(context, ["data_retention.cancel_job"]);
  if (!reason?.trim()) throw new AppError("A reason is required to cancel an archive job.", "ARCHIVE_REASON_REQUIRED", 400);
  await repository.cancelArchiveJob(env, context.companyId, id);
  await audit(env, context, "archive_job_cancelled", "archive_job", id, reason);
  return safeJob(await repository.findArchiveJob(env, context.companyId, id));
};

export const listArchiveItems = async (env: Env, context: AuthActor, id: string, filters: { status?: string; page: number; page_size: number }) => {
  requireAny(context, ["data_retention.view", "data_retention.audit.view"]);
  const job = await repository.findArchiveJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("The archive job could not be found.");
  const items = await repository.listArchiveItems(env, context.companyId, id, filters);
  return {
    data: items,
    filters,
    pagination: { page: filters.page, page_size: filters.page_size, total: items.length, total_pages: Math.max(1, Math.ceil(items.length / filters.page_size)) },
    generated_at: new Date().toISOString(),
  };
};

export const archiveItem = async (env: Env, context: AuthActor, sourceType: ArchiveSourceType, sourceId: string, input: ArchiveItemActionInput) => {
  requireAny(context, ["data_retention.archive"]);
  const settings = await getSettingsInternal(env, context.companyId);
  await ensureBackupRequirement(env, context, settings);
  if (sourceType === "audit_logs" || sourceType === "mixed") throw new AppError("This source cannot be archived directly.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  const table = repository.sourceTableForType(sourceType);
  if (!table) throw new AppError("Unsupported archive source.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  const check = await revalidateItemForArchive(env, context.companyId, { source_type: sourceType, source_table: table, source_id: sourceId }, settings);
  if (!check.ok) throw new AppError(check.reason ?? "This record is not eligible for archive.", "ARCHIVE_ITEM_NOT_ELIGIBLE", 409);
  await repository.archiveSourceRow(env, context.companyId, table, sourceId, context.actorUserId, input.reason);
  await audit(env, context, "archive_item_archived", sourceType, sourceId, input.reason, { direct: true });
  return { source_type: sourceType, source_id: sourceId, status: "archived" };
};

export const restoreArchivedItem = async (env: Env, context: AuthActor, sourceType: ArchiveSourceType, sourceId: string, input: ArchiveItemActionInput) => {
  requireAny(context, ["data_retention.restore"]);
  const settings = await getSettingsInternal(env, context.companyId);
  if (!settings.allow_restore_from_archive) throw new AppError("Restore from archive is disabled for this company.", "ARCHIVE_RESTORE_NOT_ALLOWED", 403);
  if (sourceType === "audit_logs" || sourceType === "mixed") throw new AppError("This source cannot be restored from archive.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  const table = repository.sourceTableForType(sourceType);
  if (!table) throw new AppError("Unsupported archive source.", "ARCHIVE_SOURCE_UNSUPPORTED", 400);
  const row = await repository.findItemSourceRow(env, context.companyId, table, sourceId);
  if (!row) throw new NotFoundError("The archived source record could not be found.");
  if (!row.archived_at) return { source_type: sourceType, source_id: sourceId, status: "skipped", message: "Record is already active." };
  if (row.employee_id) {
    const parent = await repository.findEmployeeForRestore(env, context.companyId, row.employee_id);
    if (!parent || parent.deleted_at) throw new AppError("Restore is blocked because the parent employee no longer exists.", "ARCHIVE_RESTORE_NOT_ALLOWED", 409);
  }
  if (sourceType === "employee_documents" && row.status === "valid" && !row.file_key) throw new AppError("Document restore is blocked because the document file is missing.", "ARCHIVE_RESTORE_NOT_ALLOWED", 409);
  await repository.restoreSourceRow(env, context.companyId, table, sourceId, context.actorUserId, input.reason, row.status);
  await audit(env, context, "archive_item_restored", sourceType, sourceId, input.reason, { direct: true });
  return { source_type: sourceType, source_id: sourceId, status: "restored" };
};

export const summary = async (env: Env, context: AuthActor) => {
  requireAny(context, ["data_retention.view"]);
  const filters = { page: 1, page_size: 10 } as ArchiveListFilters;
  const jobs = await repository.listArchiveJobs(env, context.companyId, filters);
  return {
    settings: await getSettingsInternal(env, context.companyId),
    recent_jobs: jobs.map(safeJob),
    purge_disabled: true,
    generated_at: new Date().toISOString(),
  };
};
