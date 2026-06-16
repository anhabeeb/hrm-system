import type { ExportCreateInput, ImportUploadInput, ListFilters } from "./import-export.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const now = () => new Date().toISOString();

export const createExportJob = (env: Env, id: string, companyId: string, userId: string, input: ExportCreateInput, fileKey: string | null, rowCount: number, status = "completed") =>
  run(
    env,
    `INSERT INTO export_jobs (id, company_id, export_type, file_type, file_key, filters_json, row_count, status, requested_by, reason, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, input.export_type, input.format, fileKey, JSON.stringify(input.filters), rowCount, status, userId, input.reason ?? null, now(), status === "completed" ? now() : null],
  );

export const listExportJobs = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.type) { clauses.push("export_type = ?"); values.push(filters.type); }
  return many<any>(
    env,
    `SELECT id, export_type, file_type, filters_json, row_count, status, requested_by, reason, created_at, completed_at,
      CASE WHEN file_key IS NULL THEN 0 ELSE 1 END AS file_ready
     FROM export_jobs WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findExportJob = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM export_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

// Internal status update. Callers must validate job access and status transitions before using this.
export const updateExportStatusUnsafeInternal = (env: Env, companyId: string, id: string, status: string) =>
  run(env, "UPDATE export_jobs SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE company_id = ? AND id = ?", [status, now(), companyId, id]);

export const createImportBatch = (env: Env, id: string, companyId: string, userId: string, input: ImportUploadInput, fileKey: string) =>
  run(
    env,
    `INSERT INTO import_batches (id, company_id, import_type, file_name, file_key, status, total_rows, success_rows, warning_rows, failed_rows, uploaded_by, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'uploaded', 0, 0, 0, 0, ?, NULL, NULL, ?)`,
    [id, companyId, input.import_type, input.file_name, fileKey, userId, now()],
  );

export const listImportBatches = (env: Env, companyId: string, filters: ListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.type) { clauses.push("import_type = ?"); values.push(filters.type); }
  return many<any>(
    env,
    `SELECT id, import_type, file_name, status, total_rows, success_rows, warning_rows, failed_rows, uploaded_by, started_at, completed_at, created_at
     FROM import_batches WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findImportBatch = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM import_batches WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const updateImportValidation = (env: Env, companyId: string, id: string, totals: { total_rows: number; valid_rows: number; invalid_rows: number }) =>
  run(env, "UPDATE import_batches SET status = ?, total_rows = ?, success_rows = ?, failed_rows = ?, completed_at = ? WHERE company_id = ? AND id = ?", [totals.invalid_rows > 0 ? "validation_failed" : "validated", totals.total_rows, totals.valid_rows, totals.invalid_rows, now(), companyId, id]);

export const findEmployeeByCode = (env: Env, companyId: string, employeeCode: string) =>
  one<{ id: string }>(env, "SELECT id FROM employees WHERE company_id = ? AND employee_code = ? AND deleted_at IS NULL LIMIT 1", [companyId, employeeCode]);

export const insertImportedEmployees = async (
  env: Env,
  companyId: string,
  actorUserId: string,
  rows: Array<Record<string, string>>,
) => {
  const timestamp = now();
  const statements = rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO employees (
        id, company_id, employee_code, full_name, employee_type, nationality, phone,
        employment_status, joined_at, primary_outlet_id, department_id, position_id,
        notes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      companyId,
      row.employee_no || row.employee_code,
      row.full_name,
      ["local", "foreign"].includes(String(row.employee_type ?? "").toLowerCase()) ? String(row.employee_type).toLowerCase() : "local",
      row.nationality || null,
      row.phone || null,
      row.employment_status || "active",
      row.joined_at || row.join_date || null,
      row.primary_outlet_id || row.outlet_id || null,
      row.department_id || null,
      row.position_id || null,
      row.notes || "Created from Excel import.",
      actorUserId,
      actorUserId,
      timestamp,
      timestamp,
    ),
  );
  if (statements.length === 0) return [];
  return env.DB.batch(statements);
};

export const markImportApplied = (env: Env, companyId: string, id: string, totals: { applied: number; failed: number; total: number }) =>
  run(
    env,
    "UPDATE import_batches SET status = ?, total_rows = ?, success_rows = ?, failed_rows = ?, completed_at = ? WHERE company_id = ? AND id = ?",
    [totals.failed > 0 ? "partially_applied" : "applied", totals.total, totals.applied, totals.failed, now(), companyId, id],
  );
