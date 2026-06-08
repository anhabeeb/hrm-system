import { execute, queryMany, queryOne } from "../../services/db.service";
import type { ImportJob, ImportJobRow, ImportListFilters, ImportRowsFilters } from "./imports.types";

const offset = (page: number, pageSize: number) => (page - 1) * pageSize;

export const findJobByIdempotency = (env: Env, companyId: string, idempotencyKey?: string | null) =>
  idempotencyKey ? queryOne<ImportJob>(env, "SELECT * FROM import_jobs WHERE company_id = ? AND idempotency_key = ? LIMIT 1", [companyId, idempotencyKey]) : Promise.resolve(null);

export const getJob = (env: Env, companyId: string, id: string) =>
  queryOne<ImportJob>(env, "SELECT * FROM import_jobs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const insertJob = (env: Env, job: ImportJob) =>
  execute(env, `INSERT INTO import_jobs (
    id, company_id, import_type, file_name, file_size, file_storage_key, status, mode,
    total_rows, valid_rows, invalid_rows, created_rows, updated_rows, skipped_rows,
    failed_rows, duplicate_rows, requested_by, requested_at, validated_at, applied_at,
    cancelled_at, failure_code, failure_message, idempotency_key, metadata_json,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    job.id,
    job.company_id,
    job.import_type,
    job.file_name,
    job.file_size,
    job.file_storage_key,
    job.status,
    job.mode,
    job.total_rows,
    job.valid_rows,
    job.invalid_rows,
    job.created_rows,
    job.updated_rows,
    job.skipped_rows,
    job.failed_rows,
    job.duplicate_rows,
    job.requested_by,
    job.requested_at,
    job.validated_at,
    job.applied_at,
    job.cancelled_at,
    job.failure_code,
    job.failure_message,
    job.idempotency_key,
    job.metadata_json,
    job.created_at,
    job.updated_at,
  ]);

export const replaceRows = async (env: Env, companyId: string, jobId: string, rows: ImportJobRow[]) => {
  await execute(env, "DELETE FROM import_job_rows WHERE company_id = ? AND import_job_id = ?", [companyId, jobId]);
  const statements = rows.map((row) => env.DB.prepare(`INSERT INTO import_job_rows (
      id, company_id, import_job_id, row_number, row_data_json, normalized_data_json,
      status, error_code, error_message, warnings_json, target_entity_type, target_entity_id,
      idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    row.id,
    row.company_id,
    row.import_job_id,
    row.row_number,
    row.row_data_json,
    row.normalized_data_json,
    row.status,
    row.error_code,
    row.error_message,
    row.warnings_json,
    row.target_entity_type,
    row.target_entity_id,
    row.idempotency_key,
    row.created_at,
    row.updated_at,
  ));
  if (statements.length > 0) await env.DB.batch(statements);
};

export const updateJobValidation = (env: Env, companyId: string, id: string, input: {
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  validatedAt: string;
  failureCode?: string | null;
  failureMessage?: string | null;
}) =>
  execute(env, `UPDATE import_jobs
    SET status = ?, total_rows = ?, valid_rows = ?, invalid_rows = ?, duplicate_rows = ?,
        validated_at = ?, failure_code = ?, failure_message = ?, updated_at = ?
    WHERE company_id = ? AND id = ? AND status IN ('uploaded', 'validating', 'preview_ready', 'validation_failed')`, [
    input.status,
    input.totalRows,
    input.validRows,
    input.invalidRows,
    input.duplicateRows,
    input.validatedAt,
    input.failureCode ?? null,
    input.failureMessage ?? null,
    input.validatedAt,
    companyId,
    id,
  ]);

export const markJobFailed = (env: Env, companyId: string, id: string, code: string, message: string, timestamp: string) =>
  execute(env, "UPDATE import_jobs SET status = 'failed', failure_code = ?, failure_message = ?, updated_at = ? WHERE company_id = ? AND id = ?", [code, message, timestamp, companyId, id]);

export const claimApplying = async (env: Env, companyId: string, id: string, timestamp: string) => {
  const result: any = await execute(env, "UPDATE import_jobs SET status = 'applying', updated_at = ? WHERE company_id = ? AND id = ? AND status IN ('preview_ready', 'partially_completed')", [timestamp, companyId, id]);
  return Number(result?.meta?.changes ?? result?.changes ?? (result?.success ? 1 : 0)) > 0;
};

export const completeJob = (env: Env, companyId: string, id: string, input: {
  status: string;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  appliedAt: string;
  failureCode?: string | null;
  failureMessage?: string | null;
}) =>
  execute(env, `UPDATE import_jobs
    SET status = ?, created_rows = ?, updated_rows = ?, skipped_rows = ?, failed_rows = ?,
        applied_at = ?, failure_code = ?, failure_message = ?, updated_at = ?
    WHERE company_id = ? AND id = ? AND status = 'applying'`, [
    input.status,
    input.createdRows,
    input.updatedRows,
    input.skippedRows,
    input.failedRows,
    input.appliedAt,
    input.failureCode ?? null,
    input.failureMessage ?? null,
    input.appliedAt,
    companyId,
    id,
  ]);

export const cancelJob = async (env: Env, companyId: string, id: string, timestamp: string) => {
  const result: any = await execute(env, `UPDATE import_jobs
    SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE company_id = ? AND id = ? AND status IN ('uploaded', 'validating', 'preview_ready', 'validation_failed')`, [timestamp, timestamp, companyId, id]);
  return Number(result?.meta?.changes ?? result?.changes ?? (result?.success ? 1 : 0)) > 0;
};

const listWhere = (companyId: string, filters: ImportListFilters, isAdmin: boolean, actorUserId: string) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (!isAdmin) {
    clauses.push("requested_by = ?");
    values.push(actorUserId);
  } else if (filters.requested_by) {
    clauses.push("requested_by = ?");
    values.push(filters.requested_by);
  }
  if (filters.import_type) { clauses.push("import_type = ?"); values.push(filters.import_type); }
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.from_date) { clauses.push("requested_at >= ?"); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push("requested_at <= ?"); values.push(filters.to_date); }
  return { sql: clauses.join(" AND "), values };
};

export const countJobs = async (env: Env, companyId: string, filters: ImportListFilters, isAdmin: boolean, actorUserId: string) => {
  const where = listWhere(companyId, filters, isAdmin, actorUserId);
  const row = await queryOne<{ total: number }>(env, `SELECT COUNT(*) AS total FROM import_jobs WHERE ${where.sql}`, where.values);
  return Number(row?.total ?? 0);
};

export const listJobs = (env: Env, companyId: string, filters: ImportListFilters, isAdmin: boolean, actorUserId: string) => {
  const where = listWhere(companyId, filters, isAdmin, actorUserId);
  return queryMany<ImportJob>(env, `SELECT * FROM import_jobs WHERE ${where.sql} ORDER BY requested_at DESC LIMIT ? OFFSET ?`, [
    ...where.values,
    filters.page_size,
    offset(filters.page, filters.page_size),
  ]);
};

export const countRows = async (env: Env, companyId: string, jobId: string, filters: ImportRowsFilters) => {
  const values: unknown[] = [companyId, jobId];
  const status = filters.status ? " AND status = ?" : "";
  if (filters.status) values.push(filters.status);
  const row = await queryOne<{ total: number }>(env, `SELECT COUNT(*) AS total FROM import_job_rows WHERE company_id = ? AND import_job_id = ?${status}`, values);
  return Number(row?.total ?? 0);
};

export const listRows = (env: Env, companyId: string, jobId: string, filters: ImportRowsFilters) => {
  const values: unknown[] = [companyId, jobId];
  const status = filters.status ? " AND status = ?" : "";
  if (filters.status) values.push(filters.status);
  return queryMany<ImportJobRow>(env, `SELECT * FROM import_job_rows WHERE company_id = ? AND import_job_id = ?${status} ORDER BY row_number ASC LIMIT ? OFFSET ?`, [
    ...values,
    filters.page_size,
    offset(filters.page, filters.page_size),
  ]);
};

export const listValidRowsForApply = (env: Env, companyId: string, jobId: string) =>
  queryMany<ImportJobRow>(env, "SELECT * FROM import_job_rows WHERE company_id = ? AND import_job_id = ? AND status = 'valid' ORDER BY row_number ASC LIMIT 5000", [companyId, jobId]);

export const markRowApplied = (env: Env, companyId: string, id: string, targetType: string, targetId: string, timestamp: string) =>
  execute(env, "UPDATE import_job_rows SET status = 'applied', target_entity_type = ?, target_entity_id = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status = 'valid'", [targetType, targetId, timestamp, companyId, id]);

export const markRowFailed = (env: Env, companyId: string, id: string, code: string, message: string, timestamp: string) =>
  execute(env, "UPDATE import_job_rows SET status = 'failed', error_code = ?, error_message = ?, updated_at = ? WHERE company_id = ? AND id = ? AND status = 'valid'", [code, message, timestamp, companyId, id]);

export const findEmployee = (env: Env, companyId: string, employeeCode: string) =>
  queryOne<any>(env, "SELECT * FROM employees WHERE company_id = ? AND employee_code = ? LIMIT 1", [companyId, employeeCode]);

export const findOutlet = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM outlets WHERE company_id = ? AND (id = ? OR lower(code) = lower(?) OR lower(name) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findDepartment = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM departments WHERE company_id = ? AND (id = ? OR lower(code) = lower(?) OR lower(name) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findPosition = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM positions WHERE company_id = ? AND (id = ? OR lower(code) = lower(?) OR lower(title) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findLeaveType = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM leave_types WHERE company_id = ? AND (id = ? OR lower(leave_key) = lower(?) OR lower(leave_name) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findDocumentCategory = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM document_categories WHERE company_id = ? AND (id = ? OR lower(category_key) = lower(?) OR lower(category_name) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findHolidayByCode = (env: Env, companyId: string, code: string) =>
  queryOne<any>(env, "SELECT * FROM holidays WHERE company_id = ? AND lower(code) = lower(?) LIMIT 1", [companyId, code]);

export const findHolidayByDateNameOutlet = (env: Env, companyId: string, name: string, date: string, outletId?: string | null, excludeId?: string | null) =>
  queryOne<any>(
    env,
    `SELECT id FROM holidays
     WHERE company_id = ?
       AND LOWER(COALESCE(name, holiday_name)) = LOWER(?)
       AND COALESCE(date, start_date) = ?
       AND COALESCE(outlet_id, '') = COALESCE(?, '')
       AND COALESCE(status, CASE WHEN is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [companyId, name, date, outletId ?? null, excludeId ?? null, excludeId ?? null],
  );

export const findAsset = (env: Env, companyId: string, value: string) =>
  queryOne<any>(env, "SELECT * FROM assets WHERE company_id = ? AND (id = ? OR lower(asset_code) = lower(?) OR lower(asset_name) = lower(?)) LIMIT 1", [companyId, value, value, value]);

export const findAttendanceImportBlock = (env: Env, companyId: string, employeeId: string, attendanceDate: string) =>
  queryOne<any>(
    env,
    `SELECT id, payroll_status, correction_applied_id
     FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND attendance_date = ?
       AND (payroll_status IN ('locked', 'finalized', 'paid') OR correction_applied_id IS NOT NULL)
     LIMIT 1`,
    [companyId, employeeId, attendanceDate],
  );

export const findPayrollRunByMonth = (env: Env, companyId: string, payrollMonth: string) =>
  queryOne<any>(env, "SELECT id, status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1", [companyId, payrollMonth]);

export const findSalaryByEmployeeEffective = (env: Env, companyId: string, employeeId: string, effectiveFrom: string) =>
  queryOne<any>(env, "SELECT id FROM employee_salary_history WHERE company_id = ? AND employee_id = ? AND effective_from = ? LIMIT 1", [companyId, employeeId, effectiveFrom]);

export const upsertEmployee = (env: Env, input: {
  id: string;
  companyId: string;
  employeeCode: string;
  fullName: string;
  employeeType: string;
  nationality: string | null;
  idCardNumber: string | null;
  passportNumber: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  outletId: string | null;
  departmentId: string | null;
  positionId: string | null;
  employmentStatus: string;
  joinedAt: string | null;
  actorId: string;
  now: string;
  update: boolean;
}) => input.update
  ? execute(env, `UPDATE employees
      SET full_name = ?, employee_type = ?, nationality = ?, id_card_number = ?, passport_number = ?,
          phone = ?, emergency_contact_name = ?, emergency_contact_phone = ?, primary_outlet_id = ?,
          department_id = ?, position_id = ?, employment_status = ?, joined_at = ?, updated_by = ?, updated_at = ?
      WHERE company_id = ? AND employee_code = ?`, [
      input.fullName,
      input.employeeType,
      input.nationality,
      input.idCardNumber,
      input.passportNumber,
      input.phone,
      input.emergencyContactName,
      input.emergencyContactPhone,
      input.outletId,
      input.departmentId,
      input.positionId,
      input.employmentStatus,
      input.joinedAt,
      input.actorId,
      input.now,
      input.companyId,
      input.employeeCode,
    ])
  : execute(env, `INSERT INTO employees (
      id, company_id, employee_code, full_name, employee_type, nationality, id_card_number,
      passport_number, phone, emergency_contact_name, emergency_contact_phone, primary_outlet_id,
      department_id, position_id, employment_status, joined_at, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      input.id,
      input.companyId,
      input.employeeCode,
      input.fullName,
      input.employeeType,
      input.nationality,
      input.idCardNumber,
      input.passportNumber,
      input.phone,
      input.emergencyContactName,
      input.emergencyContactPhone,
      input.outletId,
      input.departmentId,
      input.positionId,
      input.employmentStatus,
      input.joinedAt,
      input.actorId,
      input.actorId,
      input.now,
      input.now,
    ]);

export const insertDocumentMetadata = (env: Env, input: { id: string; companyId: string; employeeId: string; documentType: string; documentNumber?: string | null; issueDate?: string | null; notes?: string | null; fileKey: string; fileName: string; expiryDate: string | null; status: string; actorId: string; now: string }) =>
  execute(env, `INSERT OR IGNORE INTO employee_documents (
    id, company_id, employee_id, document_type, file_key, file_name, mime_type, expiry_date, status, is_sensitive,
    uploaded_by, created_at, updated_at, document_number, issue_date, document_category, notes
  ) VALUES (?, ?, ?, ?, ?, ?, 'metadata/import', ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?)`, [
    input.id,
    input.companyId,
    input.employeeId,
    input.documentType,
    input.fileKey,
    input.fileName,
    input.expiryDate,
    input.status,
    input.now,
    input.now,
    input.documentNumber ?? null,
    input.issueDate ?? null,
    input.documentType,
    input.notes ?? "Document metadata imported; file upload still required.",
  ]);

export const upsertLeaveBalance = (env: Env, input: { id: string; txId: string; companyId: string; employeeId: string; leaveTypeId: string; year: number; opening: number; carried: number; reason: string; actorId: string; idempotencyKey: string; now: string }) =>
  env.DB.batch([
    env.DB.prepare(`INSERT INTO leave_balances (
      id, company_id, employee_id, leave_type_id, year, opening_balance, accrued_days, used_days, remaining_days,
      pending_days, adjusted_days, carried_forward_days, expired_days, available_days, entitlement_days,
      policy_year, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, 0, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(company_id, employee_id, leave_type_id, year) DO UPDATE SET
      opening_balance = excluded.opening_balance,
      carried_forward_days = excluded.carried_forward_days,
      remaining_days = excluded.remaining_days,
      available_days = excluded.available_days,
      updated_at = excluded.updated_at`).bind(
      input.id,
      input.companyId,
      input.employeeId,
      input.leaveTypeId,
      input.year,
      input.opening,
      input.opening + input.carried,
      input.carried,
      input.opening + input.carried,
      input.opening + input.carried,
      input.year,
      input.now,
      input.now,
    ),
    env.DB.prepare(`INSERT OR IGNORE INTO leave_balance_transactions (
      id, company_id, employee_id, leave_type_id, balance_id, transaction_type, quantity_days,
      balance_before, balance_after, effective_date, reason, source, idempotency_key, created_by, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, 'opening_import', ?, 0, ?, ?, ?, 'import', ?, ?, ?, ?)`).bind(
      input.txId,
      input.companyId,
      input.employeeId,
      input.leaveTypeId,
      input.id,
      input.opening + input.carried,
      input.opening + input.carried,
      `${input.year}-01-01`,
      input.reason,
      input.idempotencyKey,
      input.actorId,
      input.now,
      JSON.stringify({ import_job_row: input.idempotencyKey }),
    ),
  ]);

export const insertSalaryHistory = (env: Env, input: { id: string; companyId: string; employeeId: string; amount: number; effectiveFrom: string; reason: string; actorId: string; now: string }) =>
  execute(env, `INSERT OR IGNORE INTO employee_salary_history (
    id, company_id, employee_id, monthly_salary_amount, currency, effective_from, reason, approval_request_id, created_by, created_at
  ) VALUES (?, ?, ?, ?, 'MVR', ?, ?, ?, ?, ?)`, [input.id, input.companyId, input.employeeId, input.amount, input.effectiveFrom, input.reason, `import:${input.id}`, input.actorId, input.now]);

export const insertAttendanceImport = (env: Env, input: { id: string; companyId: string; employeeId: string; outletId: string; eventType: string; eventTime: string; localId: string; now: string }) =>
  execute(env, `INSERT OR IGNORE INTO attendance_events (
    id, company_id, employee_id, outlet_id, device_id, event_type, event_time, attendance_method, source, local_id,
    created_offline, sync_status, approval_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'manual', 'import', ?, 0, 'synced', 'approved', ?, ?)`, [
    input.id,
    input.companyId,
    input.employeeId,
    input.outletId,
    input.eventType,
    input.eventTime,
    input.localId,
    input.now,
    input.now,
  ]);

export const markAttendanceSummaryPendingImportRecalculation = (env: Env, input: { id: string; companyId: string; employeeId: string; outletId: string; attendanceDate: string; now: string }) =>
  execute(env, `INSERT INTO attendance_daily_summary (
    id, company_id, employee_id, outlet_id, attendance_date, worked_minutes, late_minutes, early_out_minutes,
    break_minutes, overtime_minutes, status, payroll_status, classification, is_incomplete,
    warnings_json, source_references_json, calculated_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'conflict', 'pending', 'pending_recalculation', 1, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id, employee_id, attendance_date) DO UPDATE SET
    status = CASE WHEN attendance_daily_summary.payroll_status IN ('locked', 'finalized', 'paid') THEN attendance_daily_summary.status ELSE 'conflict' END,
    classification = CASE WHEN attendance_daily_summary.payroll_status IN ('locked', 'finalized', 'paid') THEN attendance_daily_summary.classification ELSE 'pending_recalculation' END,
    is_incomplete = CASE WHEN attendance_daily_summary.payroll_status IN ('locked', 'finalized', 'paid') THEN attendance_daily_summary.is_incomplete ELSE 1 END,
    warnings_json = excluded.warnings_json,
    source_references_json = excluded.source_references_json,
    calculated_at = excluded.calculated_at,
    updated_at = excluded.updated_at`, [
    input.id,
    input.companyId,
    input.employeeId,
    input.outletId,
    input.attendanceDate,
    JSON.stringify(["Imported attendance requires summary recalculation/review."]),
    JSON.stringify({ source: "import", pending_recalculation: true }),
    input.now,
    input.now,
    input.now,
  ]);

export const insertHolidayImport = (env: Env, input: { id: string; existingId?: string | null; companyId: string; name: string; code?: string | null; type: string; startDate: string; endDate: string | null; paid: number; recurring: number; outletId: string | null; appliesLocal: number; appliesForeign: number; affectsLeave: number; affectsAttendance: number; affectsLongLeave: number; notes?: string | null; actorId: string; now: string }) =>
  input.outletId
    ? env.DB.batch([
      env.DB.prepare(`INSERT INTO holidays (
        id, company_id, holiday_name, name, code, holiday_type, start_date, date, end_date, is_paid, paid_holiday,
        is_enabled, repeat_yearly, is_recurring, recurrence_rule, recurrence_month, recurrence_day,
        outlet_id, applies_to_all_outlets, applies_to_local_employees, applies_to_foreign_employees,
        affects_leave, affects_leave_duration, affects_payroll, affects_long_leave_payroll,
        affects_attendance, affects_attendance_absence, affects_roster, status, source, notes,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 'import', ?, ?, ?, ?, ?)`).bind(
        input.existingId ?? input.id,
        input.companyId,
        input.name,
        input.name,
        input.code ?? null,
        input.type,
        input.startDate,
        input.startDate,
        input.endDate,
        input.paid,
        input.paid,
        input.recurring,
        input.recurring,
        input.recurring ? "yearly" : null,
        Number(input.startDate.slice(5, 7)),
        Number(input.startDate.slice(8, 10)),
        input.outletId,
        input.appliesLocal,
        input.appliesForeign,
        input.affectsLeave,
        input.affectsLeave,
        input.affectsLongLeave,
        input.affectsLongLeave,
        input.affectsAttendance,
        input.affectsAttendance,
        input.notes ?? null,
        input.actorId,
        input.actorId,
        input.now,
        input.now,
      ),
      env.DB.prepare("INSERT OR IGNORE INTO holiday_outlets (id, company_id, holiday_id, outlet_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(`${input.existingId ?? input.id}:${input.outletId}`, input.companyId, input.existingId ?? input.id, input.outletId, input.now),
    ])
    : execute(env, `INSERT INTO holidays (
      id, company_id, holiday_name, name, code, holiday_type, start_date, date, end_date, is_paid, paid_holiday,
      is_enabled, repeat_yearly, is_recurring, recurrence_rule, recurrence_month, recurrence_day,
      outlet_id, applies_to_all_outlets, applies_to_local_employees, applies_to_foreign_employees,
      affects_leave, affects_leave_duration, affects_payroll, affects_long_leave_payroll,
      affects_attendance, affects_attendance_absence, affects_roster, status, source, notes,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 'import', ?, ?, ?, ?, ?)`, [
      input.existingId ?? input.id,
      input.companyId,
      input.name,
      input.name,
      input.code ?? null,
      input.type,
      input.startDate,
      input.startDate,
      input.endDate,
      input.paid,
      input.paid,
      input.recurring,
      input.recurring,
      input.recurring ? "yearly" : null,
      Number(input.startDate.slice(5, 7)),
      Number(input.startDate.slice(8, 10)),
      input.appliesLocal,
      input.appliesForeign,
      input.affectsLeave,
      input.affectsLeave,
      input.affectsLongLeave,
      input.affectsLongLeave,
      input.affectsAttendance,
      input.affectsAttendance,
      input.notes ?? null,
      input.actorId,
      input.actorId,
      input.now,
      input.now,
    ]);

export const updateHolidayImport = async (env: Env, input: { id: string; companyId: string; name: string; code?: string | null; type: string; startDate: string; endDate: string | null; paid: number; recurring: number; outletId: string | null; appliesLocal: number; appliesForeign: number; affectsLeave: number; affectsAttendance: number; affectsLongLeave: number; notes?: string | null; actorId: string; now: string }) => {
  const statements = [
    env.DB.prepare(`UPDATE holidays SET
      holiday_name = ?, name = ?, code = ?, holiday_type = ?, start_date = ?, date = ?, end_date = ?,
      is_paid = ?, paid_holiday = ?, repeat_yearly = ?, is_recurring = ?, recurrence_rule = ?,
      recurrence_month = ?, recurrence_day = ?, outlet_id = ?, applies_to_all_outlets = ?,
      applies_to_local_employees = ?, applies_to_foreign_employees = ?,
      affects_leave = ?, affects_leave_duration = ?, affects_payroll = ?, affects_long_leave_payroll = ?,
      affects_attendance = ?, affects_attendance_absence = ?, notes = ?, source = 'import',
      updated_by = ?, updated_at = ?
      WHERE company_id = ? AND id = ?`).bind(
      input.name,
      input.name,
      input.code ?? null,
      input.type,
      input.startDate,
      input.startDate,
      input.endDate,
      input.paid,
      input.paid,
      input.recurring,
      input.recurring,
      input.recurring ? "yearly" : null,
      Number(input.startDate.slice(5, 7)),
      Number(input.startDate.slice(8, 10)),
      input.outletId,
      input.outletId ? 0 : 1,
      input.appliesLocal,
      input.appliesForeign,
      input.affectsLeave,
      input.affectsLeave,
      input.affectsLongLeave,
      input.affectsLongLeave,
      input.affectsAttendance,
      input.affectsAttendance,
      input.notes ?? null,
      input.actorId,
      input.now,
      input.companyId,
      input.id,
    ),
  ];
  if (input.outletId) {
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO holiday_outlets (id, company_id, holiday_id, outlet_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(`${input.id}:${input.outletId}`, input.companyId, input.id, input.outletId, input.now));
  }
  await env.DB.batch(statements);
};

export const insertAdvance = (env: Env, input: { id: string; companyId: string; employeeId: string; amount: number; paidDate: string; deductionMonth: string; status: string; reason: string; actorId: string; now: string }) =>
  execute(env, `INSERT INTO advance_payments (
    id, company_id, employee_id, amount, paid_date, deduction_month, status, reason, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.companyId, input.employeeId, input.amount, input.paidDate, input.deductionMonth, input.status, input.reason, input.actorId, input.now, input.now]);

export const insertLoan = (env: Env, input: { id: string; companyId: string; employeeId: string; amount: number; installment: number; startMonth: string; status: string; actorId: string; now: string }) =>
  execute(env, `INSERT INTO salary_loans (
    id, company_id, employee_id, loan_amount, installment_amount, outstanding_amount, start_month, status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.companyId, input.employeeId, input.amount, input.installment, input.amount, input.startMonth, input.status, input.actorId, input.now, input.now]);

export const insertAssetAssignment = (env: Env, input: { id: string; companyId: string; assetId: string; employeeId: string; outletId: string | null; issuedDate: string; condition: string | null; status: string; actorId: string; now: string }) =>
  execute(env, `INSERT INTO asset_assignments (
    id, company_id, asset_id, employee_id, outlet_id, issued_date, issue_condition, status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    input.id,
    input.companyId,
    input.assetId,
    input.employeeId,
    input.outletId,
    input.issuedDate,
    input.condition,
    input.status,
    input.actorId,
    input.now,
    input.now,
  ]);

export const insertUniformIssue = (env: Env, input: { id: string; companyId: string; employeeId: string; outletId: string | null; uniformType: string; issuedDate: string; status: string; actorId: string; now: string }) =>
  execute(env, `INSERT INTO uniform_issues (
    id, company_id, employee_id, outlet_id, uniform_type, quantity, issued_date, status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`, [
    input.id,
    input.companyId,
    input.employeeId,
    input.outletId,
    input.uniformType,
    input.issuedDate,
    input.status,
    input.actorId,
    input.now,
    input.now,
  ]);
