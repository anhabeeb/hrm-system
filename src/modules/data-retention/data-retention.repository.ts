import type { ArchiveCandidate, ArchiveListFilters, ArchiveSourceType } from "./data-retention.types";

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

export const getSetting = (env: Env, companyId: string, key: string) =>
  one<{ setting_value_json: string }>(env, "SELECT setting_value_json FROM company_settings WHERE company_id = ? AND setting_key = ? LIMIT 1", [companyId, key]);

export const upsertSetting = (env: Env, companyId: string, key: string, valueJson: string) =>
  run(
    env,
    `INSERT INTO company_settings (id, company_id, setting_key, setting_group, setting_value_json, effective_from, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, 'data_retention', ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT(company_id, setting_key) DO UPDATE SET setting_value_json = excluded.setting_value_json, updated_at = excluded.updated_at`,
    [`${companyId}_${key.replace(/\./g, "_")}`, companyId, key, valueJson, now(), now()],
  );

export const findArchiveJobByIdempotencyKey = (env: Env, companyId: string, idempotencyKey: string) =>
  one<any>(env, "SELECT * FROM archive_jobs WHERE company_id = ? AND idempotency_key = ? LIMIT 1", [companyId, idempotencyKey]);

export const createArchiveJob = (env: Env, input: { id: string; companyId: string; archiveType: string; sourceType: string; requestedBy: string; filtersJson: string; reason?: string | null; idempotencyKey?: string | null; metadataJson?: string | null }) =>
  run(
    env,
    `INSERT INTO archive_jobs (
      id, company_id, archive_type, source_type, status, requested_by, requested_at,
      filters_json, reason, idempotency_key, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.archiveType, input.sourceType, input.requestedBy, now(), input.filtersJson, input.reason ?? null, input.idempotencyKey ?? null, input.metadataJson ?? null, now(), now()],
  );

export const listArchiveJobs = (env: Env, companyId: string, filters: ArchiveListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.source_type) { clauses.push("source_type = ?"); values.push(filters.source_type); }
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.requested_by) { clauses.push("requested_by = ?"); values.push(filters.requested_by); }
  return many<any>(
    env,
    `SELECT * FROM archive_jobs WHERE ${clauses.join(" AND ")} ORDER BY requested_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findArchiveJob = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM archive_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const replaceArchiveItems = async (env: Env, companyId: string, archiveJobId: string, items: Array<{
  id: string;
  sourceType: string;
  sourceTable: string;
  sourceId: string;
  employeeId?: string | null;
  outletId?: string | null;
  departmentId?: string | null;
  action: string;
  status: string;
  reason?: string | null;
  warningCode?: string | null;
  warningMessage?: string | null;
  blockedReason?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
}>) => {
  const statements = [
    env.DB.prepare("DELETE FROM archive_job_items WHERE company_id = ? AND archive_job_id = ?").bind(companyId, archiveJobId),
    ...items.map((item) => env.DB.prepare(`INSERT INTO archive_job_items (
      id, company_id, archive_job_id, source_type, source_table, source_id, employee_id, outlet_id, department_id,
      action, status, reason, warning_code, warning_message, blocked_reason, previous_status, new_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(item.id, companyId, archiveJobId, item.sourceType, item.sourceTable, item.sourceId, item.employeeId ?? null, item.outletId ?? null, item.departmentId ?? null, item.action, item.status, item.reason ?? null, item.warningCode ?? null, item.warningMessage ?? null, item.blockedReason ?? null, item.previousStatus ?? null, item.newStatus ?? null, now(), now())),
  ];
  await env.DB.batch(statements);
};

export const markPreviewReady = (env: Env, companyId: string, id: string, counts: { total: number; eligible: number; blocked: number }) =>
  run(
    env,
    "UPDATE archive_jobs SET status = 'preview_ready', total_candidates = ?, eligible_count = ?, blocked_count = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status = 'pending'",
    [counts.total, counts.eligible, counts.blocked, now(), companyId, id],
  );

export const claimArchiveProcessing = async (env: Env, companyId: string, id: string) => {
  const result = await run(env, "UPDATE archive_jobs SET status = 'processing', started_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status = 'preview_ready'", [now(), now(), companyId, id]);
  return changes(result) > 0;
};

export const completeArchiveJob = (env: Env, companyId: string, id: string, counts: { status: string; archived: number; restored: number; skipped: number; failed: number; blocked: number; failureCode?: string | null; failureMessage?: string | null }) =>
  run(
    env,
    `UPDATE archive_jobs SET status = ?, completed_at = ?, archived_count = ?, restored_count = ?, skipped_count = ?,
      failed_count = ?, blocked_count = ?, failure_code = ?, failure_message = ?, updated_at = ?
     WHERE company_id = ? AND id = ? AND status = 'processing'`,
    [counts.status, now(), counts.archived, counts.restored, counts.skipped, counts.failed, counts.blocked, counts.failureCode ?? null, counts.failureMessage ?? null, now(), companyId, id],
  );

export const failArchiveJob = (env: Env, companyId: string, id: string, code: string, message: string) =>
  run(env, "UPDATE archive_jobs SET status = 'failed', failed_at = ?, failure_code = ?, failure_message = ?, updated_at = ? WHERE company_id = ? AND id = ?", [now(), code, message, now(), companyId, id]);

export const cancelArchiveJob = (env: Env, companyId: string, id: string) =>
  run(env, "UPDATE archive_jobs SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('pending', 'preview_ready', 'processing')", [now(), now(), companyId, id]);

export const listArchiveItems = (env: Env, companyId: string, archiveJobId: string, filters: { status?: string; page: number; page_size: number }) => {
  const clauses = ["company_id = ?", "archive_job_id = ?"];
  const values: unknown[] = [companyId, archiveJobId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  return many<any>(
    env,
    `SELECT * FROM archive_job_items WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const updateArchiveItemOutcome = (env: Env, companyId: string, itemId: string, input: { status: string; newStatus?: string | null; blockedReason?: string | null; warningCode?: string | null; warningMessage?: string | null }) =>
  run(
    env,
    `UPDATE archive_job_items SET status = ?, new_status = ?, blocked_reason = COALESCE(?, blocked_reason),
      warning_code = COALESCE(?, warning_code), warning_message = COALESCE(?, warning_message), updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [input.status, input.newStatus ?? null, input.blockedReason ?? null, input.warningCode ?? null, input.warningMessage ?? null, now(), companyId, itemId],
  );

const safeMany = async <T>(env: Env, sql: string, values: readonly unknown[]) => {
  try {
    return await many<T>(env, sql, values);
  } catch {
    return [];
  }
};

const safeOne = async <T>(env: Env, sql: string, values: readonly unknown[]) => {
  try {
    return await one<T>(env, sql, values);
  } catch {
    return null;
  }
};

const cutoffClause = (dateExpression: string) => `(${dateExpression}) < ?`;

const rowToCandidate = (sourceType: ArchiveSourceType, sourceTable: string, row: any): ArchiveCandidate => ({
  id: String(row.id),
  sourceType,
  sourceTable,
  employeeId: row.employee_id ?? null,
  outletId: row.outlet_id ?? row.primary_outlet_id ?? null,
  departmentId: row.department_id ?? null,
  status: row.status ?? row.employment_status ?? null,
  dateValue: row.date_value ?? row.created_at ?? null,
  eligible: Boolean(row.eligible),
  blockedReason: row.blocked_reason ?? null,
  warningCode: row.warning_code ?? null,
  warningMessage: row.warning_message ?? null,
});

export const findArchiveCandidates = async (env: Env, companyId: string, sourceType: ArchiveSourceType, cutoffDate: string, limit: number): Promise<ArchiveCandidate[]> => {
  if (sourceType === "employees") {
    const rows = await safeMany<any>(
      env,
      `SELECT id, NULL AS employee_id, primary_outlet_id, department_id, employment_status, COALESCE(terminated_at, resigned_at, updated_at, created_at) AS date_value,
        CASE WHEN employment_status IN ('terminated', 'resigned', 'offboarded', 'inactive', 'archived') AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN employment_status IN ('terminated', 'resigned', 'offboarded', 'inactive', 'archived') THEN NULL ELSE 'Active employee records cannot be archived.' END AS blocked_reason
       FROM employees WHERE company_id = ? AND ${cutoffClause("COALESCE(terminated_at, resigned_at, updated_at, created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "employees", row));
  }

  if (sourceType === "employee_documents") {
    const rows = await safeMany<any>(
      env,
      `SELECT d.id, d.employee_id, e.primary_outlet_id AS outlet_id, e.department_id, d.status, COALESCE(d.expiry_date, d.updated_at, d.created_at) AS date_value,
        CASE WHEN d.status IN ('expired', 'replaced', 'archived', 'metadata_only', 'pending_file', 'missing_file') AND d.archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN d.status IN ('expired', 'replaced', 'archived', 'metadata_only', 'pending_file', 'missing_file') THEN NULL ELSE 'Only expired, replaced, or metadata-only documents are eligible.' END AS blocked_reason
       FROM employee_documents d LEFT JOIN employees e ON e.company_id = d.company_id AND e.id = d.employee_id
       WHERE d.company_id = ? AND ${cutoffClause("COALESCE(d.expiry_date, d.updated_at, d.created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "employee_documents", row));
  }

  if (sourceType === "attendance") {
    const rows = await safeMany<any>(
      env,
      `SELECT a.id, a.employee_id, a.outlet_id, e.department_id, a.approval_status AS status, a.event_time AS date_value,
        CASE WHEN a.archived_at IS NULL THEN 1 ELSE 0 END AS eligible, NULL AS blocked_reason
       FROM attendance_events a LEFT JOIN employees e ON e.company_id = a.company_id AND e.id = a.employee_id
       WHERE a.company_id = ? AND ${cutoffClause("a.event_time")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "attendance_events", row));
  }

  if (sourceType === "biometric_logs") {
    const rows = await safeMany<any>(
      env,
      `SELECT b.id, b.employee_id, b.outlet_id, e.department_id, b.sync_status AS status, b.event_time AS date_value,
        CASE WHEN b.archived_at IS NULL THEN 1 ELSE 0 END AS eligible, NULL AS blocked_reason
       FROM biometric_attendance_logs b LEFT JOIN employees e ON e.company_id = b.company_id AND e.id = b.employee_id
       WHERE b.company_id = ? AND ${cutoffClause("b.event_time")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "biometric_attendance_logs", row));
  }

  if (sourceType === "leave") {
    const rows = await safeMany<any>(
      env,
      `SELECT l.id, l.employee_id, e.primary_outlet_id AS outlet_id, e.department_id, l.status, COALESCE(l.end_date, l.updated_at, l.created_at) AS date_value,
        CASE WHEN l.status IN ('approved', 'completed', 'rejected', 'cancelled') AND l.archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN l.status IN ('approved', 'completed', 'rejected', 'cancelled') THEN NULL ELSE 'Open leave requests cannot be archived.' END AS blocked_reason
       FROM leave_requests l LEFT JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
       WHERE l.company_id = ? AND ${cutoffClause("COALESCE(l.end_date, l.updated_at, l.created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "leave_requests", row));
  }

  if (sourceType === "long_leave") {
    const rows = await safeMany<any>(
      env,
      `SELECT l.id, l.employee_id, e.primary_outlet_id AS outlet_id, e.department_id, l.status, COALESCE(l.actual_return_date, l.expected_return_date, l.updated_at, l.created_at) AS date_value,
        CASE WHEN l.status IN ('completed', 'returned', 'cancelled', 'rejected') AND l.archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN l.status IN ('completed', 'returned', 'cancelled', 'rejected') THEN NULL ELSE 'Open long leave records cannot be archived.' END AS blocked_reason
       FROM long_leave_records l LEFT JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
       WHERE l.company_id = ? AND ${cutoffClause("COALESCE(l.actual_return_date, l.expected_return_date, l.updated_at, l.created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "long_leave_records", row));
  }

  if (sourceType === "payroll" || sourceType === "payslips") {
    const table = sourceType === "payroll" ? "payroll_runs" : "payslips";
    const rows = await safeMany<any>(
      env,
      sourceType === "payroll"
        ? `SELECT id, NULL AS employee_id, NULL AS outlet_id, NULL AS department_id, status, COALESCE(payroll_month, updated_at, created_at) AS date_value,
             CASE WHEN status IN ('finalized', 'paid', 'locked') AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
             CASE WHEN status IN ('finalized', 'paid', 'locked') THEN NULL ELSE 'Draft or open payroll cannot be archived.' END AS blocked_reason
           FROM payroll_runs WHERE company_id = ? AND ${cutoffClause("COALESCE(payroll_month, updated_at, created_at)")} LIMIT ?`
        : `SELECT p.id, p.employee_id, e.primary_outlet_id AS outlet_id, e.department_id, p.status, p.generated_at AS date_value,
             CASE WHEN p.status IN ('generated', 'delivered', 'downloaded', 'locked', 'archived') AND p.archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
             CASE WHEN p.status IN ('generated', 'delivered', 'downloaded', 'locked', 'archived') THEN NULL ELSE 'Only generated or locked payslips can be archived.' END AS blocked_reason
           FROM payslips p LEFT JOIN employees e ON e.company_id = p.company_id AND e.id = p.employee_id
           WHERE p.company_id = ? AND ${cutoffClause("p.generated_at")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, table, row));
  }

  if (sourceType === "notifications") {
    const rows = await safeMany<any>(
      env,
      `SELECT id, employee_id, outlet_id, NULL AS department_id, status, created_at AS date_value,
        CASE WHEN status IN ('read', 'dismissed', 'archived') AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN status IN ('read', 'dismissed', 'archived') THEN NULL ELSE 'Unread or urgent notifications stay active.' END AS blocked_reason
       FROM notifications WHERE company_id = ? AND ${cutoffClause("created_at")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "notifications", row));
  }

  if (sourceType === "email_notifications") {
    const rows = await safeMany<any>(
      env,
      `SELECT id, employee_id, outlet_id, NULL AS department_id, status, created_at AS date_value,
        CASE WHEN status IN ('sent', 'failed', 'cancelled', 'skipped') AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN status IN ('sent', 'failed', 'cancelled', 'skipped') THEN NULL ELSE 'Pending email jobs cannot be archived.' END AS blocked_reason
       FROM email_notifications WHERE company_id = ? AND ${cutoffClause("created_at")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "email_notifications", row));
  }

  if (sourceType === "expiry_alerts") {
    const rows = await safeMany<any>(
      env,
      `SELECT x.id, x.employee_id, e.primary_outlet_id AS outlet_id, e.department_id, x.status, COALESCE(x.expiry_date, x.updated_at, x.created_at) AS date_value,
        CASE WHEN x.status IN ('resolved', 'dismissed', 'archived') AND x.archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN x.status IN ('resolved', 'dismissed', 'archived') THEN NULL ELSE 'Open or critical expiry alerts cannot be archived.' END AS blocked_reason
       FROM expiry_alerts x LEFT JOIN employees e ON e.company_id = x.company_id AND e.id = x.employee_id
       WHERE x.company_id = ? AND ${cutoffClause("COALESCE(x.expiry_date, x.updated_at, x.created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "expiry_alerts", row));
  }

  if (sourceType === "imports" || sourceType === "exports") {
    const table = sourceType === "imports" ? "import_jobs" : "report_export_jobs";
    const rows = await safeMany<any>(
      env,
      `SELECT id, NULL AS employee_id, NULL AS outlet_id, NULL AS department_id, status, COALESCE(requested_at, created_at) AS date_value,
        CASE WHEN status IN ('completed', 'partially_completed', 'failed', 'cancelled', 'expired') AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN status IN ('completed', 'partially_completed', 'failed', 'cancelled', 'expired') THEN NULL ELSE 'Active jobs cannot be archived.' END AS blocked_reason
       FROM ${table} WHERE company_id = ? AND ${cutoffClause("COALESCE(requested_at, created_at)")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, table, row));
  }

  if (sourceType === "backup_restore") {
    const rows = await safeMany<any>(
      env,
      `SELECT id, NULL AS employee_id, NULL AS outlet_id, NULL AS department_id, status, COALESCE(expires_at, requested_at, created_at) AS date_value,
        CASE WHEN status IN ('completed', 'failed', 'cancelled', 'expired') AND (expires_at IS NULL OR expires_at < ?) AND archived_at IS NULL THEN 1 ELSE 0 END AS eligible,
        CASE WHEN status IN ('pending', 'processing') THEN 'Active backup jobs cannot be archived.' WHEN expires_at >= ? THEN 'Available backups are kept until expiry.' ELSE NULL END AS blocked_reason
       FROM backup_jobs WHERE company_id = ? AND ${cutoffClause("COALESCE(expires_at, requested_at, created_at)")} LIMIT ?`,
      [cutoffDate, new Date().toISOString(), companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "backup_jobs", row));
  }

  if (sourceType === "audit_logs") {
    const rows = await safeMany<any>(
      env,
      `SELECT id, employee_id, outlet_id, NULL AS department_id, action AS status, created_at AS date_value,
        0 AS eligible, 'Audit logs remain queryable and are archive-view-only in this phase.' AS blocked_reason
       FROM audit_logs WHERE company_id = ? AND ${cutoffClause("created_at")} LIMIT ?`,
      [companyId, cutoffDate, limit],
    );
    return rows.map((row) => rowToCandidate(sourceType, "audit_logs", row));
  }

  return [];
};

export const findRecentValidBackup = (env: Env, companyId: string, nowIso: string, minCompletedAt: string) =>
  safeOne<any>(
    env,
    `SELECT id, status, completed_at, expires_at, storage_location, content_json
     FROM backup_jobs
     WHERE company_id = ?
       AND status = 'completed'
       AND COALESCE(completed_at, created_at, requested_at) >= ?
       AND (expires_at IS NULL OR expires_at > ?)
       AND (storage_location IS NOT NULL OR content_json IS NOT NULL)
     ORDER BY COALESCE(completed_at, created_at, requested_at) DESC
     LIMIT 1`,
    [companyId, minCompletedAt, nowIso],
  );

const existsBySql = async (env: Env, sql: string, values: readonly unknown[]) => {
  const row = await safeOne<{ found: number }>(env, sql, values);
  return Number(row?.found ?? 0) > 0;
};

export const getEmployeeArchiveBlocker = async (env: Env, companyId: string, employeeId: string) => {
  if (await existsBySql(env, "SELECT 1 AS found FROM leave_requests WHERE company_id = ? AND employee_id = ? AND status NOT IN ('approved', 'completed', 'rejected', 'cancelled') LIMIT 1", [companyId, employeeId])) return "Employee has open leave requests.";
  if (await existsBySql(env, "SELECT 1 AS found FROM long_leave_records WHERE company_id = ? AND employee_id = ? AND status NOT IN ('completed', 'returned', 'cancelled', 'rejected') LIMIT 1", [companyId, employeeId])) return "Employee has open long leave or pending return.";
  if (await existsBySql(env, "SELECT 1 AS found FROM expiry_alerts WHERE company_id = ? AND employee_id = ? AND status NOT IN ('resolved', 'dismissed', 'archived') LIMIT 1", [companyId, employeeId])) return "Employee has unresolved expiry alerts.";
  if (await existsBySql(env, `SELECT 1 AS found FROM payroll_items pi JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    WHERE pi.company_id = ? AND pi.employee_id = ? AND pr.status NOT IN ('finalized', 'paid', 'locked', 'cancelled') LIMIT 1`, [companyId, employeeId])) return "Employee has unfinalized payroll records.";
  if (await existsBySql(env, "SELECT 1 AS found FROM employee_offboarding_cases WHERE company_id = ? AND employee_id = ? AND (status NOT IN ('completed', 'cancelled') OR final_settlement_status NOT IN ('completed', 'paid', 'finalized')) LIMIT 1", [companyId, employeeId])) return "Employee has pending final settlement or offboarding work.";
  if (await existsBySql(env, "SELECT 1 AS found FROM asset_assignments WHERE company_id = ? AND employee_id = ? AND returned_date IS NULL AND status NOT IN ('returned', 'cancelled', 'lost', 'archived') LIMIT 1", [companyId, employeeId])) return "Employee has unreturned assets/uniforms.";
  if (await existsBySql(env, "SELECT 1 AS found FROM uniform_issues WHERE company_id = ? AND employee_id = ? AND returned_date IS NULL AND status NOT IN ('returned', 'cancelled', 'lost', 'archived') LIMIT 1", [companyId, employeeId])) return "Employee has unreturned assets/uniforms.";
  if (await existsBySql(env, "SELECT 1 AS found FROM employee_documents WHERE company_id = ? AND employee_id = ? AND status IN ('pending_file', 'metadata_only', 'missing_file', 'requires_review') LIMIT 1", [companyId, employeeId])) return "Employee has pending documents requiring HR action.";
  return null;
};

export const getAttendanceArchiveBlocker = async (env: Env, companyId: string, employeeId: string | null, attendanceEventId: string, attendanceDate: string) => {
  if (!employeeId) return "Attendance event is not linked to an employee.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_daily_summary WHERE company_id = ? AND employee_id = ? AND attendance_date = ? AND payroll_status NOT IN ('finalized', 'locked', 'paid') LIMIT 1", [companyId, employeeId, attendanceDate])) return "Attendance date is not payroll-finalized.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_daily_summary WHERE company_id = ? AND employee_id = ? AND attendance_date = ? AND status IN ('exception', 'pending_review', 'missing_clock_in', 'missing_clock_out', 'review_required') LIMIT 1", [companyId, employeeId, attendanceDate])) return "Attendance summary has unresolved review status.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_conflicts WHERE company_id = ? AND employee_id = ? AND date(created_at) = ? AND status IN ('pending', 'open') LIMIT 1", [companyId, employeeId, attendanceDate])) return "Attendance summary has unresolved exception/review status.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_corrections WHERE company_id = ? AND employee_id = ? AND status IN ('pending', 'open', 'approved') AND (attendance_event_id = ? OR date(created_at) = ?) LIMIT 1", [companyId, employeeId, attendanceEventId, attendanceDate])) return "Manual correction is pending or active.";
  return null;
};

export const getBiometricArchiveBlocker = async (env: Env, companyId: string, employeeId: string | null, eventDate: string) => {
  if (!employeeId) return "Biometric punch is not linked to an employee.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_daily_summary WHERE company_id = ? AND employee_id = ? AND attendance_date = ? AND payroll_status NOT IN ('finalized', 'locked', 'paid') LIMIT 1", [companyId, employeeId, eventDate])) return "Linked attendance summary is not finalized.";
  if (await existsBySql(env, "SELECT 1 AS found FROM attendance_conflicts WHERE company_id = ? AND employee_id = ? AND date(created_at) = ? AND status IN ('pending', 'open') LIMIT 1", [companyId, employeeId, eventDate])) return "Biometric punch review is unresolved.";
  return null;
};

export const findEmployeeForRestore = (env: Env, companyId: string, employeeId: string) =>
  safeOne<any>(env, "SELECT id, employment_status, deleted_at, archived_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1", [companyId, employeeId]);

export const findItemSourceRow = (env: Env, companyId: string, table: string, id: string) =>
  one<any>(env, `SELECT * FROM ${table} WHERE company_id = ? AND id = ? LIMIT 1`, [companyId, id]);

export const archiveSourceRow = (env: Env, companyId: string, table: string, id: string, actorId: string, reason: string) => {
  if (table === "notifications") {
    return run(env, "UPDATE notifications SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE company_id = ? AND id = ? AND archived_at IS NULL", [now(), now(), companyId, id]);
  }
  return run(env, `UPDATE ${table} SET archived_at = COALESCE(archived_at, ?), archived_by = ?, archive_reason = ? WHERE company_id = ? AND id = ? AND archived_at IS NULL`, [now(), actorId, reason, companyId, id]);
};

export const restoreSourceRow = (env: Env, companyId: string, table: string, id: string, actorId: string, reason: string, previousStatus?: string | null) => {
  if (table === "notifications") {
    return run(env, "UPDATE notifications SET archived_at = NULL, updated_at = ? WHERE company_id = ? AND id = ? AND archived_at IS NOT NULL", [now(), companyId, id]);
  }
  return run(env, `UPDATE ${table} SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, restored_at = ?, restored_by = ?, restore_reason = ? WHERE company_id = ? AND id = ? AND archived_at IS NOT NULL`, [now(), actorId, reason, companyId, id]);
};

export const sourceTableForType = (sourceType: string) => {
  const map: Record<string, string> = {
    employees: "employees",
    employee_documents: "employee_documents",
    attendance: "attendance_events",
    biometric_logs: "biometric_attendance_logs",
    leave: "leave_requests",
    long_leave: "long_leave_records",
    payroll: "payroll_runs",
    payslips: "payslips",
    notifications: "notifications",
    email_notifications: "email_notifications",
    expiry_alerts: "expiry_alerts",
    imports: "import_jobs",
    exports: "report_export_jobs",
    backup_restore: "backup_jobs",
    audit_logs: "audit_logs",
  };
  return map[sourceType] ?? null;
};
