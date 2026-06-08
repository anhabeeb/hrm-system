import type { ListFilters } from "./backup-recovery.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const now = () => new Date().toISOString();
const changes = (result: D1Result) => result.meta?.changes ?? (result as unknown as { changes?: number }).changes ?? 0;

export const findBackupByIdempotencyKey = (env: Env, companyId: string, idempotencyKey: string) =>
  one<any>(env, "SELECT * FROM backup_jobs WHERE company_id = ? AND idempotency_key = ? LIMIT 1", [companyId, idempotencyKey]);

export const createBackupJob = (env: Env, input: { id: string; companyId: string; backupType: string; fileKey?: string | null; fileName?: string | null; fileSize?: number | null; userId: string; status?: string; idempotencyKey?: string | null; manifestJson?: string | null; metadataJson?: string | null }) =>
  run(
    env,
    `INSERT INTO backup_jobs (
      id, company_id, backup_type, status, storage_location, file_name, file_size,
      started_by, started_at, completed_at, error_message, created_at,
      requested_by, requested_at, manifest_json, idempotency_key, metadata_json, updated_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.backupType, input.status ?? "pending", input.fileKey ?? null, input.fileName ?? null, input.fileSize ?? null, input.userId, now(), now(), input.userId, now(), input.manifestJson ?? null, input.idempotencyKey ?? null, input.metadataJson ?? null, now()],
  );

export const claimBackupProcessing = async (env: Env, companyId: string, id: string) => {
  const result = await run(
    env,
    "UPDATE backup_jobs SET status = 'processing', started_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('pending', 'failed')",
    [now(), now(), companyId, id],
  );
  return changes(result) > 0;
};

export const completeBackupJob = (env: Env, companyId: string, id: string, input: { fileKey: string | null; fileName: string; fileSize: number; checksum: string; manifestJson: string; tableCount: number; rowCount: number; includedTablesJson: string; excludedTablesJson: string; redactionSummaryJson: string; expiresAt: string | null; contentJson?: string | null }) =>
  run(
    env,
    `UPDATE backup_jobs SET status = 'completed', storage_location = ?, file_name = ?, file_size = ?, checksum_sha256 = ?,
      manifest_json = ?, table_count = ?, row_count = ?, included_tables_json = ?, excluded_tables_json = ?,
      redaction_summary_json = ?, completed_at = ?, expires_at = ?, failure_code = NULL, failure_message = NULL,
      error_message = NULL, content_json = ?, updated_at = ?
     WHERE company_id = ? AND id = ? AND status = 'processing'`,
    [input.fileKey, input.fileName, input.fileSize, input.checksum, input.manifestJson, input.tableCount, input.rowCount, input.includedTablesJson, input.excludedTablesJson, input.redactionSummaryJson, now(), input.expiresAt, input.contentJson ?? null, now(), companyId, id],
  );

export const failBackupJob = (env: Env, companyId: string, id: string, code: string, message: string) =>
  run(env, "UPDATE backup_jobs SET status = 'failed', failed_at = ?, failure_code = ?, failure_message = ?, error_message = ?, updated_at = ? WHERE company_id = ? AND id = ?", [now(), code, message, message, now(), companyId, id]);

export const cancelBackupJob = (env: Env, companyId: string, id: string) =>
  run(env, "UPDATE backup_jobs SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('pending', 'processing')", [now(), now(), companyId, id]);

export const listBackups = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.type) { clauses.push("backup_type = ?"); values.push(filters.type); }
  return many<any>(
    env,
    `SELECT id, backup_type, status, file_name, file_size, started_by, started_at, completed_at, error_message, created_at,
      CASE WHEN storage_location IS NULL AND content_json IS NULL THEN 0 ELSE 1 END AS file_ready
     FROM backup_jobs WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findBackup = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM backup_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const markBackupDeleted = (env: Env, companyId: string, id: string) =>
  run(env, "UPDATE backup_jobs SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE company_id = ? AND id = ?", [now(), now(), companyId, id]);

export const latestBackupStatus = (env: Env, companyId: string) =>
  one<any>(env, "SELECT completed_at AS latest_backup_at, status AS latest_backup_status FROM backup_jobs WHERE company_id = ? ORDER BY created_at DESC LIMIT 1", [companyId]);

export const failedBackupCount = async (env: Env, companyId: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM backup_jobs WHERE company_id = ? AND status = 'failed'", [companyId]);
  return row?.total ?? 0;
};

export const getSetting = (env: Env, companyId: string, key: string) =>
  one<{ setting_value_json: string }>(env, "SELECT setting_value_json FROM company_settings WHERE company_id = ? AND setting_key = ? LIMIT 1", [companyId, key]);

export const upsertSetting = (env: Env, companyId: string, key: string, group: string, valueJson: string) =>
  run(
    env,
    `INSERT INTO company_settings (id, company_id, setting_key, setting_group, setting_value_json, effective_from, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT(company_id, setting_key) DO UPDATE SET setting_value_json = excluded.setting_value_json, updated_at = excluded.updated_at`,
    [`${companyId}_${key.replace(/\./g, "_")}`, companyId, key, group, valueJson, now(), now()],
  );

export const createRestoreRequest = (env: Env, input: { id: string; companyId: string; backupId?: string | null; userId: string; restoreType: string; reason: string }) =>
  run(
    env,
    `INSERT INTO restore_requests (id, company_id, backup_job_id, requested_by, approved_by, restore_type, reason, status, maintenance_started_at, maintenance_ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', NULL, NULL, ?, ?)`,
    [input.id, input.companyId, input.backupId ?? null, input.userId, input.restoreType, input.reason, now(), now()],
  );

export const listRestoreRequests = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  return many<any>(env, `SELECT * FROM restore_requests WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, filters.page_size, (filters.page - 1) * filters.page_size]);
};

export const findRestoreRequest = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM restore_requests WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const updateRestoreStatus = (env: Env, companyId: string, id: string, status: string, userId: string) =>
  run(env, "UPDATE restore_requests SET status = ?, approved_by = ?, updated_at = ? WHERE company_id = ? AND id = ?", [status, userId, now(), companyId, id]);

export const createRestoreJob = (env: Env, input: { id: string; companyId: string; backupJobId?: string | null; sourceFileName?: string | null; restoreMode: string; userId: string; metadataJson?: string | null }) =>
  run(
    env,
    `INSERT INTO restore_jobs (
      id, company_id, backup_job_id, source_file_storage_key, source_file_name, status, restore_mode,
      requested_by, requested_at, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, 'uploaded', ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.backupJobId ?? null, input.sourceFileName ?? null, input.restoreMode, input.userId, now(), input.metadataJson ?? null, now(), now()],
  );

export const listRestoreJobs = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  return many<any>(env, `SELECT * FROM restore_jobs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, filters.page_size, (filters.page - 1) * filters.page_size]);
};

export const findRestoreJob = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM restore_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const replaceRestoreRows = async (env: Env, companyId: string, restoreJobId: string, rows: Array<{ id: string; tableName: string; rowNumber: number; sourceId: string | null; targetId: string | null; status: string; action: string; errorCode?: string | null; errorMessage?: string | null; warningsJson?: string | null }>) => {
  const statements = [
    env.DB.prepare("DELETE FROM restore_job_rows WHERE company_id = ? AND restore_job_id = ?").bind(companyId, restoreJobId),
    ...rows.map((row) => env.DB.prepare(`INSERT INTO restore_job_rows (
      id, company_id, restore_job_id, table_name, row_number, source_id, target_id, status, action,
      error_code, error_message, warnings_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(row.id, companyId, restoreJobId, row.tableName, row.rowNumber, row.sourceId, row.targetId, row.status, row.action, row.errorCode ?? null, row.errorMessage ?? null, row.warningsJson ?? null, now(), now())),
  ];
  await env.DB.batch(statements);
};

export const markRestoreValidated = (env: Env, companyId: string, id: string, input: { status: string; totalTables: number; totalRows: number; validRows: number; invalidRows: number; conflictRows: number; checksumVerified: number; manifestVerified: number; failureCode?: string | null; failureMessage?: string | null }) =>
  run(
    env,
    `UPDATE restore_jobs SET status = ?, validated_at = ?, total_tables = ?, total_rows = ?, valid_rows = ?, invalid_rows = ?,
      conflict_rows = ?, checksum_verified = ?, manifest_verified = ?, failure_code = ?, failure_message = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [input.status, now(), input.totalTables, input.totalRows, input.validRows, input.invalidRows, input.conflictRows, input.checksumVerified, input.manifestVerified, input.failureCode ?? null, input.failureMessage ?? null, now(), companyId, id],
  );

export const claimRestoreApplying = async (env: Env, companyId: string, id: string) => {
  const result = await run(env, "UPDATE restore_jobs SET status = 'restoring', updated_at = ? WHERE company_id = ? AND id = ? AND status = 'preview_ready'", [now(), companyId, id]);
  return changes(result) > 0;
};

export const completeRestoreJob = (env: Env, companyId: string, id: string, input: { status: string; restoredRows: number; skippedRows: number; failedRows: number; failureCode?: string | null; failureMessage?: string | null }) =>
  run(env, "UPDATE restore_jobs SET status = ?, restored_at = ?, restored_rows = ?, skipped_rows = ?, failed_rows = ?, failure_code = ?, failure_message = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status = 'restoring'", [input.status, now(), input.restoredRows, input.skippedRows, input.failedRows, input.failureCode ?? null, input.failureMessage ?? null, now(), companyId, id]);

export const cancelRestoreJob = (env: Env, companyId: string, id: string) =>
  run(env, "UPDATE restore_jobs SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('uploaded', 'validating', 'preview_ready')", [now(), now(), companyId, id]);
