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

export const createBackupJob = (env: Env, input: { id: string; companyId: string; backupType: string; fileKey: string; fileName: string; fileSize: number; userId: string }) =>
  run(
    env,
    `INSERT INTO backup_jobs (id, company_id, backup_type, status, storage_location, file_name, file_size, started_by, started_at, completed_at, error_message, created_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [input.id, input.companyId, input.backupType, input.fileKey, input.fileName, input.fileSize, input.userId, now(), now(), now()],
  );

export const listBackups = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.type) { clauses.push("backup_type = ?"); values.push(filters.type); }
  return many<any>(
    env,
    `SELECT id, backup_type, status, file_name, file_size, started_by, started_at, completed_at, error_message, created_at,
      CASE WHEN storage_location IS NULL THEN 0 ELSE 1 END AS file_ready
     FROM backup_jobs WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findBackup = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM backup_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const markBackupDeleted = (env: Env, companyId: string, id: string) =>
  run(env, "UPDATE backup_jobs SET status = 'deleted' WHERE company_id = ? AND id = ?", [companyId, id]);

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
