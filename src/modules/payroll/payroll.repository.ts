import type {
  PayrollCalculateInput,
  PayrollEmployee,
  PayrollExceptionFilters,
  PayrollItemFilters,
  PayrollItemRecord,
  PayrollListFilters,
  PayrollOutletScope,
  PayrollRunRecord,
} from "./payroll.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();

const applyOutletScope = (
  clauses: string[],
  values: unknown[],
  alias: string,
  filters: { outlet_id?: string },
  scope: PayrollOutletScope,
) => {
  if (scope.isSuperAdmin) return;
  if (scope.outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && !scope.outletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`${alias}.outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

const applyRunOutletScope = (
  clauses: string[],
  values: unknown[],
  filters: { outlet_id?: string },
  scope?: PayrollOutletScope,
) => {
  const scopedOutletIds = scope && !scope.isSuperAdmin ? scope.outletIds : [];
  if (scope && !scope.isSuperAdmin && scopedOutletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && scope && !scope.isSuperAdmin && !scopedOutletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }

  const outletIds = filters.outlet_id ? [filters.outlet_id] : scopedOutletIds;
  if (outletIds.length === 0) return;
  clauses.push(`EXISTS (
    SELECT 1 FROM payroll_items scoped_items
    WHERE scoped_items.company_id = payroll_runs.company_id
      AND scoped_items.payroll_run_id = payroll_runs.id
      AND scoped_items.outlet_id IN (${outletIds.map(() => "?").join(", ")})
  )`);
  values.push(...outletIds);
};

export const listActiveOutletIds = async (env: Env, companyId: string) => {
  const rows = await many<{ id: string }>(
    env,
    "SELECT id FROM outlets WHERE company_id = ? AND status = 'active' AND deleted_at IS NULL",
    [companyId],
  );
  return rows.map((row) => row.id);
};

export const findRunById = (env: Env, companyId: string, id: string) =>
  one<PayrollRunRecord>(
    env,
    "SELECT * FROM payroll_runs WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findRunByMonth = (env: Env, companyId: string, payrollMonth: string) =>
  one<PayrollRunRecord>(
    env,
    "SELECT * FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, payrollMonth],
  );

export const listRuns = (env: Env, companyId: string, filters: PayrollListFilters, scope?: PayrollOutletScope) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.payroll_month) { clauses.push("payroll_month = ?"); values.push(filters.payroll_month); }
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.date_from) { clauses.push("created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("created_at <= ?"); values.push(filters.date_to); }
  applyRunOutletScope(clauses, values, filters, scope);
  return many<PayrollRunRecord>(
    env,
    `SELECT * FROM payroll_runs WHERE ${clauses.join(" AND ")}
     ORDER BY ${filters.sort_by} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countRuns = async (env: Env, companyId: string, filters: PayrollListFilters, scope?: PayrollOutletScope) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.payroll_month) { clauses.push("payroll_month = ?"); values.push(filters.payroll_month); }
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.date_from) { clauses.push("created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("created_at <= ?"); values.push(filters.date_to); }
  applyRunOutletScope(clauses, values, filters, scope);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM payroll_runs WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const upsertRun = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    payrollMonth: string;
    status: string;
    calculationBasis: string;
    calculatedBy: string;
  },
) =>
  run(
    env,
    `INSERT INTO payroll_runs (
      id, company_id, payroll_month, status, calculation_basis,
      total_gross_amount, total_deduction_amount, total_net_amount,
      calculated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
    ON CONFLICT(company_id, payroll_month)
    DO UPDATE SET status = excluded.status, calculation_basis = excluded.calculation_basis,
      calculated_by = excluded.calculated_by, updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.payrollMonth,
      input.status,
      input.calculationBasis,
      input.calculatedBy,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateRunTotals = (
  env: Env,
  companyId: string,
  runId: string,
  totals: { gross: number; deductions: number; net: number },
) =>
  run(
    env,
    `UPDATE payroll_runs SET total_gross_amount = ?, total_deduction_amount = ?,
      total_net_amount = ?, updated_at = ? WHERE company_id = ? AND id = ?`,
    [totals.gross, totals.deductions, totals.net, new Date().toISOString(), companyId, runId],
  );

export const updateRunStatus = (
  env: Env,
  companyId: string,
  runId: string,
  values: { status: string; approvedBy?: string | null },
) =>
  run(
    env,
    `UPDATE payroll_runs SET status = ?, approved_by = COALESCE(?, approved_by), updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      values.status,
      values.approvedBy ?? null,
      new Date().toISOString(),
      companyId,
      runId,
    ],
  );

export const lockRun = (env: Env, companyId: string, runId: string, lockedBy: string) =>
  run(
    env,
    "UPDATE payroll_runs SET status = 'locked', locked_by = ?, locked_at = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [lockedBy, new Date().toISOString(), new Date().toISOString(), companyId, runId],
  );

export const reopenRun = (env: Env, companyId: string, runId: string) =>
  run(
    env,
    "UPDATE payroll_runs SET status = 'reopened', locked_by = NULL, locked_at = NULL, updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), companyId, runId],
  );

export const clearRunCalculation = (env: Env, companyId: string, runId: string) =>
  env.DB.batch([
    env.DB.prepare("DELETE FROM payroll_earnings WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ?)").bind(companyId, companyId, runId),
    env.DB.prepare("DELETE FROM payroll_deductions WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ?)").bind(companyId, companyId, runId),
    env.DB.prepare("DELETE FROM payroll_items WHERE company_id = ? AND payroll_run_id = ?").bind(companyId, runId),
    env.DB.prepare("DELETE FROM payroll_exceptions WHERE company_id = ? AND payroll_run_id = ?").bind(companyId, runId),
  ]);

export const listEligibleEmployees = (
  env: Env,
  companyId: string,
  input: PayrollCalculateInput,
  scope: PayrollOutletScope,
) => {
  const clauses = [
    "company_id = ?",
    "deleted_at IS NULL",
    "employment_status NOT IN ('archived', 'terminated', 'resigned')",
  ];
  const values: unknown[] = [companyId];
  if (input.outlet_id) {
    clauses.push("primary_outlet_id = ?");
    values.push(input.outlet_id);
  }
  if (!scope.isSuperAdmin) {
    if (scope.outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`primary_outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
      values.push(...scope.outletIds);
    }
  }
  if (input.employee_ids?.length) {
    clauses.push(`id IN (${input.employee_ids.map(() => "?").join(", ")})`);
    values.push(...input.employee_ids);
  }
  return many<PayrollEmployee>(
    env,
    `SELECT id, employee_code, full_name, employee_type, primary_outlet_id, employment_status,
      joined_at, resigned_at, terminated_at, deleted_at
     FROM employees WHERE ${clauses.join(" AND ")}
     ORDER BY employee_code ASC`,
    values,
  );
};

export const findSalaryForMonth = (env: Env, companyId: string, employeeId: string, monthEndDate: string, monthStartDate: string) =>
  one<{ monthly_salary_amount: number }>(
    env,
    `SELECT monthly_salary_amount FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [companyId, employeeId, monthEndDate, monthStartDate],
  );

export const listAttendanceSummaries = (env: Env, companyId: string, employeeId: string, start: string, end: string) =>
  many<any>(
    env,
    `SELECT * FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [companyId, employeeId, start, end],
  );

export const listApprovedLeaveRequests = (env: Env, companyId: string, employeeId: string, start: string, end: string) =>
  many<any>(
    env,
    `SELECT r.*, lt.is_paid, lt.affects_payroll FROM leave_requests r
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE r.company_id = ? AND r.employee_id = ?
       AND r.status IN ('approved', 'direct_approved')
       AND r.start_date <= ? AND r.end_date >= ?`,
    [companyId, employeeId, end, start],
  );

export const listLongLeaveImpacts = (env: Env, companyId: string, employeeId: string, payrollMonth: string) =>
  many<any>(
    env,
    `SELECT i.*, l.salary_impact_confirmed, l.status AS long_leave_status
     FROM long_leave_salary_impacts i
     JOIN long_leave_records l ON l.id = i.long_leave_record_id
     WHERE i.company_id = ? AND i.employee_id = ? AND i.payroll_month = ?
       AND l.status IN ('pending', 'approved', 'returned')`,
    [companyId, employeeId, payrollMonth],
  );

export const listUnconfirmedLongLeave = (env: Env, companyId: string, payrollMonth: string, outletId?: string) => {
  const clauses = ["l.company_id = ?", "l.salary_impact_confirmed = 0", "l.status IN ('pending', 'approved')", "l.start_date <= ?", "l.expected_return_date >= ?"];
  const values: unknown[] = [companyId, `${payrollMonth}-31`, `${payrollMonth}-01`];
  if (outletId) { clauses.push("e.primary_outlet_id = ?"); values.push(outletId); }
  return many<any>(
    env,
    `SELECT l.*, e.primary_outlet_id AS outlet_id FROM long_leave_records l
     JOIN employees e ON e.id = l.employee_id
     WHERE ${clauses.join(" AND ")}`,
    values,
  );
};

export const listApprovedAdvances = (env: Env, companyId: string, employeeId: string, payrollMonth: string) =>
  many<any>(
    env,
    "SELECT * FROM advance_payments WHERE company_id = ? AND employee_id = ? AND deduction_month = ? AND status = 'approved'",
    [companyId, employeeId, payrollMonth],
  );

export const listLoanInstallments = (env: Env, companyId: string, employeeId: string, payrollMonth: string) =>
  many<any>(
    env,
    `SELECT i.* FROM salary_loan_installments i
     JOIN salary_loans l ON l.id = i.salary_loan_id
     WHERE i.company_id = ? AND i.employee_id = ? AND i.payroll_month = ?
       AND i.status IN ('scheduled', 'due') AND l.status IN ('approved', 'active')`,
    [companyId, employeeId, payrollMonth],
  );

export const listAssetDeductions = (env: Env, companyId: string, employeeId: string, payrollMonth: string) =>
  many<any>(
    env,
    `SELECT * FROM asset_deductions
     WHERE company_id = ? AND employee_id = ? AND status = 'approved' AND payroll_item_id IS NULL
       AND (
        json_extract(reason, '$.deduction_month') IS NULL
        OR json_extract(reason, '$.deduction_month') = ?
       )`,
    [companyId, employeeId, payrollMonth],
  );

export const createItem = (env: Env, item: PayrollItemRecord) =>
  run(
    env,
    `INSERT INTO payroll_items (
      id, company_id, payroll_run_id, employee_id, outlet_id, basic_salary_amount,
      payable_basic_amount, gross_amount, total_deductions_amount, net_amount,
      carry_forward_deduction_amount, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.company_id,
      item.payroll_run_id,
      item.employee_id,
      item.outlet_id,
      item.basic_salary_amount,
      item.payable_basic_amount,
      item.gross_amount,
      item.total_deductions_amount,
      item.net_amount,
      item.carry_forward_deduction_amount,
      item.status,
      item.created_at,
      item.updated_at,
    ],
  );

export const createEarning = (env: Env, input: { id: string; companyId: string; payrollItemId: string; earningType: string; amount: number; sourceType?: string | null; sourceId?: string | null; notes?: string | null }) =>
  run(
    env,
    "INSERT INTO payroll_earnings (id, company_id, payroll_item_id, earning_type, amount, source_type, source_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.id, input.companyId, input.payrollItemId, input.earningType, input.amount, input.sourceType ?? null, input.sourceId ?? null, input.notes ?? null, new Date().toISOString()],
  );

export const createDeduction = (env: Env, input: { id: string; companyId: string; payrollItemId: string; deductionType: string; amount: number; sourceType?: string | null; sourceId?: string | null; notes?: string | null }) =>
  run(
    env,
    "INSERT INTO payroll_deductions (id, company_id, payroll_item_id, deduction_type, amount, source_type, source_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.id, input.companyId, input.payrollItemId, input.deductionType, input.amount, input.sourceType ?? null, input.sourceId ?? null, input.notes ?? null, new Date().toISOString()],
  );

export const createException = (env: Env, input: { id: string; companyId: string; payrollRunId: string; employeeId?: string | null; outletId?: string | null; exceptionType: string; severity: string; message: string }) =>
  run(
    env,
    `INSERT INTO payroll_exceptions (
      id, company_id, payroll_run_id, employee_id, outlet_id, exception_type,
      severity, message, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    [input.id, input.companyId, input.payrollRunId, input.employeeId ?? null, input.outletId ?? null, input.exceptionType, input.severity, input.message, new Date().toISOString()],
  );

export const listItems = (env: Env, companyId: string, runId: string, filters: PayrollItemFilters, scope: PayrollOutletScope) => {
  const clauses = ["i.company_id = ?", "i.payroll_run_id = ?"];
  const values: unknown[] = [companyId, runId];
  applyOutletScope(clauses, values, "i", filters, scope);
  if (filters.employee_id) { clauses.push("i.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("i.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.status) { clauses.push("i.status = ?"); values.push(filters.status); }
  return many<any>(
    env,
    `SELECT i.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name
     FROM payroll_items i JOIN employees e ON e.id = i.employee_id
     LEFT JOIN outlets o ON o.id = i.outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.employee_code ASC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countItems = async (env: Env, companyId: string, runId: string, filters: PayrollItemFilters, scope: PayrollOutletScope) => {
  const clauses = ["i.company_id = ?", "i.payroll_run_id = ?"];
  const values: unknown[] = [companyId, runId];
  applyOutletScope(clauses, values, "i", filters, scope);
  if (filters.employee_id) { clauses.push("i.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("i.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.status) { clauses.push("i.status = ?"); values.push(filters.status); }
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM payroll_items i WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const getRunItemTotals = async (
  env: Env,
  companyId: string,
  runId: string,
  scope: PayrollOutletScope,
  outletId?: string,
) => {
  const clauses = ["company_id = ?", "payroll_run_id = ?"];
  const values: unknown[] = [companyId, runId];
  applyOutletScope(clauses, values, "payroll_items", outletId ? { outlet_id: outletId } : {}, scope);
  if (outletId) { clauses.push("outlet_id = ?"); values.push(outletId); }
  const row = await one<{ total_gross_amount: number; total_deduction_amount: number; total_net_amount: number }>(
    env,
    `SELECT COALESCE(SUM(gross_amount), 0) AS total_gross_amount,
      COALESCE(SUM(total_deductions_amount), 0) AS total_deduction_amount,
      COALESCE(SUM(net_amount), 0) AS total_net_amount
     FROM payroll_items WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return {
    total_gross_amount: row?.total_gross_amount ?? 0,
    total_deduction_amount: row?.total_deduction_amount ?? 0,
    total_net_amount: row?.total_net_amount ?? 0,
  };
};

export const findItem = (env: Env, companyId: string, runId: string, itemId: string) =>
  one<any>(
    env,
    `SELECT i.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name
     FROM payroll_items i JOIN employees e ON e.id = i.employee_id
     LEFT JOIN outlets o ON o.id = i.outlet_id
     WHERE i.company_id = ? AND i.payroll_run_id = ? AND i.id = ? LIMIT 1`,
    [companyId, runId, itemId],
  );

export const listExceptions = (env: Env, companyId: string, runId: string, filters: PayrollExceptionFilters, scope: PayrollOutletScope) => {
  const clauses = ["x.company_id = ?", "x.payroll_run_id = ?"];
  const values: unknown[] = [companyId, runId];
  applyOutletScope(clauses, values, "x", filters, scope);
  if (filters.severity) { clauses.push("x.severity = ?"); values.push(filters.severity); }
  if (filters.status) { clauses.push("x.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("x.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("x.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.exception_type) { clauses.push("x.exception_type = ?"); values.push(filters.exception_type); }
  return many<any>(
    env,
    `SELECT x.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name
     FROM payroll_exceptions x
     LEFT JOIN employees e ON e.id = x.employee_id
     LEFT JOIN outlets o ON o.id = x.outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY CASE x.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, x.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countExceptions = async (env: Env, companyId: string, runId: string, filters: PayrollExceptionFilters, scope: PayrollOutletScope) => {
  const clauses = ["x.company_id = ?", "x.payroll_run_id = ?"];
  const values: unknown[] = [companyId, runId];
  applyOutletScope(clauses, values, "x", filters, scope);
  if (filters.severity) { clauses.push("x.severity = ?"); values.push(filters.severity); }
  if (filters.status) { clauses.push("x.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("x.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("x.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.exception_type) { clauses.push("x.exception_type = ?"); values.push(filters.exception_type); }
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM payroll_exceptions x WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const countOpenCriticalExceptions = async (env: Env, companyId: string, runId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM payroll_exceptions WHERE company_id = ? AND payroll_run_id = ? AND severity = 'critical' AND status = 'open'",
    [companyId, runId],
  );
  return row?.total ?? 0;
};

export const resolveException = (env: Env, companyId: string, runId: string, exceptionId: string, userId: string) =>
  run(
    env,
    "UPDATE payroll_exceptions SET status = 'resolved', resolved_by = ?, resolved_at = ? WHERE company_id = ? AND payroll_run_id = ? AND id = ?",
    [userId, new Date().toISOString(), companyId, runId, exceptionId],
  );

export const updateAttendancePayrollStatus = (env: Env, companyId: string, payrollMonth: string, status: string) =>
  run(
    env,
    "UPDATE attendance_daily_summary SET payroll_status = ?, updated_at = ? WHERE company_id = ? AND attendance_date BETWEEN ? AND ?",
    [status, new Date().toISOString(), companyId, `${payrollMonth}-01`, `${payrollMonth}-31`],
  );

export const countPendingAttendanceConflicts = async (env: Env, companyId: string, payrollMonth: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_conflicts
     WHERE company_id = ? AND status = 'pending'
       AND substr(COALESCE(
         json_extract(local_payload_json, '$.event_time'),
         json_extract(local_payload_json, '$.attendance_date'),
         json_extract(server_payload_json, '$.event_time'),
         json_extract(server_payload_json, '$.attendance_date'),
         created_at
       ), 1, 7) = ?`,
    [companyId, payrollMonth],
  );
  return row?.total ?? 0;
};

export const countPendingAttendanceCorrections = async (env: Env, companyId: string, payrollMonth: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_corrections c
     LEFT JOIN attendance_events e ON e.id = c.attendance_event_id AND e.company_id = c.company_id
     WHERE c.company_id = ? AND c.status = 'pending'
       AND substr(COALESCE(
         e.event_time,
         json_extract(c.new_value_json, '$.event_time'),
         json_extract(c.new_value_json, '$.attendance_date'),
         c.created_at
       ), 1, 7) = ?`,
    [companyId, payrollMonth],
  );
  return row?.total ?? 0;
};

export const countProblemAttendanceSummaries = async (env: Env, companyId: string, payrollMonth: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_daily_summary
     WHERE company_id = ? AND attendance_date BETWEEN ? AND ?
       AND status IN ('missing_clock_in', 'missing_clock_out', 'conflict')`,
    [companyId, `${payrollMonth}-01`, `${payrollMonth}-31`],
  );
  return row?.total ?? 0;
};

export const countActiveEmployeesMissingAttendanceSummaries = async (env: Env, companyId: string, payrollMonth: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employees e
     WHERE e.company_id = ? AND e.deleted_at IS NULL
       AND e.employment_status NOT IN ('archived', 'terminated', 'resigned')
       AND NOT EXISTS (
         SELECT 1 FROM attendance_daily_summary s
         WHERE s.company_id = e.company_id AND s.employee_id = e.id
           AND s.attendance_date BETWEEN ? AND ?
       )`,
    [companyId, `${payrollMonth}-01`, `${payrollMonth}-31`],
  );
  return row?.total ?? 0;
};

export const countEmployeesMissingSalaryHistory = async (env: Env, companyId: string, payrollMonth: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employees e
     WHERE e.company_id = ? AND e.deleted_at IS NULL
       AND e.employment_status NOT IN ('archived', 'terminated', 'resigned')
       AND NOT EXISTS (
         SELECT 1 FROM employee_salary_history h
         WHERE h.company_id = e.company_id AND h.employee_id = e.id
           AND h.effective_from <= ?
           AND (h.effective_to IS NULL OR h.effective_to >= ?)
       )`,
    [companyId, `${payrollMonth}-31`, `${payrollMonth}-01`],
  );
  return row?.total ?? 0;
};

export const createApprovalWorkflowRequest = (env: Env, input: { id: string; companyId: string; workflowId: string; module: string; entityType: string; entityId: string; requestedBy: string; summary: string; payloadJson: string }) =>
  run(
    env,
    `INSERT INTO approval_requests (
      id, company_id, workflow_id, module, entity_type, entity_id,
      requested_by, status, current_step, summary, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.workflowId, input.module, input.entityType, input.entityId, input.requestedBy, input.summary, input.payloadJson, new Date().toISOString(), new Date().toISOString()],
  );

export const findApprovalWorkflow = (env: Env, companyId: string, workflowKey: string) =>
  one<{ id: string; is_enabled: number }>(
    env,
    "SELECT id, is_enabled FROM approval_workflows WHERE company_id = ? AND workflow_key = ? LIMIT 1",
    [companyId, workflowKey],
  );

export const createExportJob = (env: Env, input: { id: string; companyId: string; filtersJson: string; requestedBy: string; reason?: string }) =>
  run(
    env,
    `INSERT INTO export_jobs (
      id, company_id, export_type, file_type, file_key, filters_json,
      row_count, status, requested_by, reason, created_at, completed_at
    ) VALUES (?, ?, 'payroll', 'json', NULL, ?, NULL, 'completed', ?, ?, ?, ?)`,
    [input.id, input.companyId, input.filtersJson, input.requestedBy, input.reason ?? null, new Date().toISOString(), new Date().toISOString()],
  );
