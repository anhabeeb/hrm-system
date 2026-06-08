import { execute, queryMany, queryOne } from "../../services/db.service";
import type { ReportExportJob, ReportExportListFilters } from "./report-exports.types";

const pageOffset = (filters: ReportExportListFilters) => (filters.page - 1) * filters.page_size;

const listWhere = (companyId: string, filters: ReportExportListFilters, isAdmin: boolean, actorUserId: string) => {
  const clauses = ["company_id = ?"];
  const bindings: unknown[] = [companyId];
  if (!isAdmin) {
    clauses.push("requested_by = ?");
    bindings.push(actorUserId);
  } else if (filters.requested_by) {
    clauses.push("requested_by = ?");
    bindings.push(filters.requested_by);
  }
  if (filters.report_category) {
    clauses.push("report_category = ?");
    bindings.push(filters.report_category);
  }
  if (filters.report_key) {
    clauses.push("report_key = ?");
    bindings.push(filters.report_key);
  }
  if (filters.format) {
    clauses.push("format = ?");
    bindings.push(filters.format);
  }
  if (filters.status) {
    clauses.push("status = ?");
    bindings.push(filters.status);
  }
  if (filters.from_date) {
    clauses.push("requested_at >= ?");
    bindings.push(filters.from_date);
  }
  if (filters.to_date) {
    clauses.push("requested_at <= ?");
    bindings.push(filters.to_date);
  }
  return { sql: clauses.join(" AND "), bindings };
};

export const insertJob = async (env: Env, job: ReportExportJob) =>
  execute(env, `INSERT INTO report_export_jobs (
    id, company_id, report_key, report_category, format, status, requested_by, requested_at,
    started_at, completed_at, failed_at, failure_code, failure_message, filters_json,
    columns_json, row_count, file_name, file_size, file_storage_key, download_url,
    expires_at, sensitive_export, redaction_level, idempotency_key, metadata_json,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    job.id,
    job.company_id,
    job.report_key,
    job.report_category,
    job.format,
    job.status,
    job.requested_by,
    job.requested_at,
    job.started_at,
    job.completed_at,
    job.failed_at,
    job.failure_code,
    job.failure_message,
    job.filters_json,
    job.columns_json,
    job.row_count,
    job.file_name,
    job.file_size,
    job.file_storage_key,
    job.download_url,
    job.expires_at,
    job.sensitive_export,
    job.redaction_level,
    job.idempotency_key,
    job.metadata_json,
    job.created_at,
    job.updated_at,
  ]);

export const findByIdempotency = (env: Env, companyId: string, idempotencyKey?: string | null) =>
  idempotencyKey
    ? queryOne<ReportExportJob>(env, "SELECT * FROM report_export_jobs WHERE company_id = ? AND idempotency_key = ?", [companyId, idempotencyKey])
    : Promise.resolve(null);

export const getJob = (env: Env, companyId: string, id: string) =>
  queryOne<ReportExportJob>(env, "SELECT * FROM report_export_jobs WHERE company_id = ? AND id = ?", [companyId, id]);

export const countJobs = async (
  env: Env,
  companyId: string,
  filters: ReportExportListFilters,
  isAdmin: boolean,
  actorUserId: string,
) => {
  const where = listWhere(companyId, filters, isAdmin, actorUserId);
  const row = await queryOne<{ total: number }>(env, `SELECT COUNT(*) AS total FROM report_export_jobs WHERE ${where.sql}`, where.bindings);
  return Number(row?.total ?? 0);
};

export const listJobs = (
  env: Env,
  companyId: string,
  filters: ReportExportListFilters,
  isAdmin: boolean,
  actorUserId: string,
) => {
  const where = listWhere(companyId, filters, isAdmin, actorUserId);
  return queryMany<ReportExportJob>(
    env,
    `SELECT * FROM report_export_jobs
     WHERE ${where.sql}
     ORDER BY requested_at DESC
     LIMIT ? OFFSET ?`,
    [...where.bindings, filters.page_size, pageOffset(filters)],
  );
};

const changed = (result: any) => Number(result?.meta?.changes ?? result?.changes ?? (result?.success ? 1 : 0)) > 0;

export const updateProcessing = async (env: Env, companyId: string, id: string, timestamp: string) => {
  const result = await execute(env, "UPDATE report_export_jobs SET status = 'processing', started_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('pending', 'failed')", [
    timestamp,
    timestamp,
    companyId,
    id,
  ]);
  return changed(result);
};

export const claimProcessing = updateProcessing;

export const markCompleted = async (
  env: Env,
  companyId: string,
  id: string,
  input: { rowCount: number; fileName: string; fileSize: number; columnsJson: string; completedAt: string },
) => {
  const result = await execute(env, `UPDATE report_export_jobs
    SET status = 'completed', completed_at = ?, failed_at = NULL, failure_code = NULL,
        failure_message = NULL, row_count = ?, file_name = ?, file_size = ?,
        columns_json = ?, updated_at = ?
    WHERE company_id = ? AND id = ? AND status = 'processing'`, [
    input.completedAt,
    input.rowCount,
    input.fileName,
    input.fileSize,
    input.columnsJson,
    input.completedAt,
    companyId,
    id,
  ]);
  return changed(result);
};

export const markFailed = async (
  env: Env,
  companyId: string,
  id: string,
  input: { code: string; message: string; failedAt: string },
) => {
  const result = await execute(env, `UPDATE report_export_jobs
    SET status = 'failed', failed_at = ?, failure_code = ?, failure_message = ?, updated_at = ?
    WHERE company_id = ? AND id = ? AND status IN ('processing', 'pending', 'failed')`, [
    input.failedAt,
    input.code,
    input.message,
    input.failedAt,
    companyId,
    id,
  ]);
  return changed(result);
};

export const cancelJob = async (env: Env, companyId: string, id: string, timestamp: string) => {
  const result = await execute(env, `UPDATE report_export_jobs
    SET status = 'cancelled', updated_at = ?
    WHERE company_id = ? AND id = ? AND status IN ('pending', 'processing')`, [timestamp, companyId, id]);
  return changed(result);
};
