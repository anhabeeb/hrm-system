import type {
  PayrollCalculateInput,
  PayrollCalculationResult,
  PayrollCompensationComponentRecord,
  PayrollEmployee,
  PayrollExceptionFilters,
  PayrollGeneratedDeduction,
  PayrollGeneratedEarning,
  PayrollItemFilters,
  PayrollItemRecord,
  PayrollListFilters,
  PayrollOutletScope,
  PayrollRunRecord,
  PayrollRepaymentSource,
  PayrollSalaryHistoryRecord,
} from "./payroll.types";
import { createPrefixedId } from "../../utils/ids";

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
    currency: string;
    periodStart: string;
    periodEnd: string;
    calculationSettingsJson: string;
    calculatedBy: string;
  },
) =>
  run(
    env,
    `INSERT INTO payroll_runs (
      id, company_id, payroll_month, payroll_year, payroll_month_number,
      period_start, period_end, status, calculation_basis, currency,
      calculation_status, calculation_version, calculation_settings_json,
      total_gross_amount, total_deduction_amount, total_net_amount,
      calculated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_calculated', 0, ?, 0, 0, 0, ?, ?, ?)
    ON CONFLICT(company_id, payroll_month)
    DO UPDATE SET status = excluded.status, calculation_basis = excluded.calculation_basis,
      payroll_year = excluded.payroll_year,
      payroll_month_number = excluded.payroll_month_number,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      currency = excluded.currency,
      calculation_settings_json = excluded.calculation_settings_json,
      calculated_by = excluded.calculated_by,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.payrollMonth,
      Number(input.payrollMonth.slice(0, 4)),
      Number(input.payrollMonth.slice(5, 7)),
      input.periodStart,
      input.periodEnd,
      input.status,
      input.calculationBasis,
      input.currency,
      input.calculationSettingsJson,
      input.calculatedBy,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const markRunCalculating = async (
  env: Env,
  companyId: string,
  runId: string,
  calculatedBy: string,
  timeoutIso: string,
) => {
  const now = new Date().toISOString();
  const result = await run(
    env,
    `UPDATE payroll_runs
     SET calculation_status = 'calculating',
       calculation_started_at = ?,
       calculated_by = ?,
       calculation_version = COALESCE(calculation_version, 0) + 1,
       updated_at = ?
     WHERE company_id = ? AND id = ?
       AND status NOT IN ('finalizing', 'finalized', 'locked', 'paid')
       AND (
        calculation_status IS NULL
        OR calculation_status NOT IN ('calculating')
        OR calculation_started_at IS NULL
        OR calculation_started_at < ?
       )`,
    [now, calculatedBy, now, companyId, runId, timeoutIso],
  );
  return (result.meta?.changes ?? 0) > 0;
};

export const markRunCalculated = (
  env: Env,
  companyId: string,
  runId: string,
  totals: { gross: number; deductions: number; net: number },
) => {
  const now = new Date().toISOString();
  return run(
    env,
    `UPDATE payroll_runs SET total_gross_amount = ?, total_deduction_amount = ?,
      total_net_amount = ?, status = CASE WHEN status IN ('draft', 'calculation_failed', 'failed') THEN 'calculated' ELSE status END,
      calculation_status = 'calculated', calculated_at = ?,
      updated_at = ? WHERE company_id = ? AND id = ?`,
    [totals.gross, totals.deductions, totals.net, now, now, companyId, runId],
  );
};

export const markRunCalculationFailed = (env: Env, companyId: string, runId: string) =>
  run(
    env,
    `UPDATE payroll_runs SET calculation_status = 'failed', status = CASE WHEN status = 'calculating' THEN 'draft' ELSE status END,
      updated_at = ? WHERE company_id = ? AND id = ?`,
    [new Date().toISOString(), companyId, runId],
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

export const submitRunForApproval = (
  env: Env,
  input: { companyId: string; runId: string; approvalRequestId: string | null; actorId: string },
) =>
  run(
    env,
    `UPDATE payroll_runs
     SET status = 'pending_approval',
       approval_request_id = ?,
       submitted_for_approval_by = ?,
       submitted_for_approval_at = ?,
       updated_at = ?
     WHERE company_id = ? AND id = ?
       AND status IN ('calculated', 'reviewed', 'reopened')`,
    [input.approvalRequestId, input.actorId, new Date().toISOString(), new Date().toISOString(), input.companyId, input.runId],
  );

export const claimRunFinalization = async (
  env: Env,
  companyId: string,
  runId: string,
  actorId: string,
  timeoutIso: string,
) => {
  const now = new Date().toISOString();
  const result = await run(
    env,
    `UPDATE payroll_runs
     SET status = 'finalizing',
       finalization_started_at = ?,
       finalization_failed_reason = NULL,
       updated_at = ?
     WHERE company_id = ? AND id = ?
       AND status IN ('approved', 'calculated', 'reviewed', 'reopened', 'finalization_failed')
       AND (
        finalization_started_at IS NULL
        OR finalization_started_at < ?
        OR status = 'finalization_failed'
       )`,
    [now, now, companyId, runId, timeoutIso],
  );
  return (result.meta?.changes ?? 0) > 0;
};

export const markRunFinalizationFailed = (
  env: Env,
  companyId: string,
  runId: string,
  reason: string,
) =>
  run(
    env,
    `UPDATE payroll_runs
     SET status = 'finalization_failed',
       finalization_failed_reason = ?,
       updated_at = ?
     WHERE company_id = ? AND id = ? AND status = 'finalizing'`,
    [reason, new Date().toISOString(), companyId, runId],
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
    env.DB.prepare("DELETE FROM payroll_earnings WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1)").bind(companyId, companyId, runId),
    env.DB.prepare("DELETE FROM payroll_deductions WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1)").bind(companyId, companyId, runId),
    env.DB.prepare("DELETE FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1").bind(companyId, runId),
    env.DB.prepare("DELETE FROM payroll_exceptions WHERE company_id = ? AND payroll_run_id = ?").bind(companyId, runId),
  ]);

export const getManualItemTotals = async (env: Env, companyId: string, runId: string) => {
  const row = await one<{ gross: number; deductions: number; net: number }>(
    env,
    `SELECT COALESCE(SUM(gross_amount), 0) AS gross,
      COALESCE(SUM(total_deductions_amount), 0) AS deductions,
      COALESCE(SUM(net_amount), 0) AS net
     FROM payroll_items
     WHERE company_id = ? AND payroll_run_id = ?
       AND COALESCE(generated_by_calculation, 1) = 0
       AND status = 'approved'`,
    [companyId, runId],
  );
  return { gross: row?.gross ?? 0, deductions: row?.deductions ?? 0, net: row?.net ?? 0 };
};

export const listEligibleEmployees = (
  env: Env,
  companyId: string,
  input: PayrollCalculateInput,
  scope: PayrollOutletScope,
) => {
  const clauses = [
    "company_id = ?",
    "deleted_at IS NULL",
    `(
      employment_status NOT IN ('archived', 'terminated', 'resigned', 'retired', 'inactive')
      OR (COALESCE(resigned_at, terminated_at) IS NOT NULL AND COALESCE(resigned_at, terminated_at) >= ?)
      OR employment_status = 'rehired'
    )`,
    "(joined_at IS NULL OR joined_at <= ?)",
  ];
  const values: unknown[] = [companyId, `${input.payroll_month}-01`, `${input.payroll_month}-31`];
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
      joined_at, resigned_at, terminated_at, deleted_at,
      (
        SELECT MAX(h.effective_from)
        FROM employee_status_history h
        WHERE h.company_id = employees.company_id
          AND h.employee_id = employees.id
          AND h.new_status = employees.employment_status
          AND h.effective_from <= ?
      ) AS status_effective_from
     FROM employees WHERE ${clauses.join(" AND ")}
     ORDER BY employee_code ASC`,
    [`${input.payroll_month}-31`, ...values],
  );
};

export const listSalaryHistoryForPeriod = (env: Env, companyId: string, employeeId: string, monthEndDate: string, monthStartDate: string) =>
  many<PayrollSalaryHistoryRecord>(
    env,
    `SELECT id, monthly_salary_amount, currency, effective_from, effective_to,
       approval_request_id, change_type
     FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from ASC, created_at ASC`,
    [companyId, employeeId, monthEndDate, monthStartDate],
  );

export const findSalaryForMonth = (env: Env, companyId: string, employeeId: string, monthEndDate: string, monthStartDate: string) =>
  one<{ monthly_salary_amount: number }>(
    env,
    `SELECT monthly_salary_amount FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [companyId, employeeId, monthEndDate, monthStartDate],
  );

export const listCompensationComponentsForPeriod = (
  env: Env,
  companyId: string,
  employeeId: string,
  monthEndDate: string,
  monthStartDate: string,
) =>
  many<PayrollCompensationComponentRecord>(
    env,
    `SELECT id, component_definition_id, component_type, component_code, component_name,
       amount, currency, calculation_type, affects_gross_pay, affects_net_pay,
       effective_from, effective_to, status
     FROM employee_compensation_components
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('active', 'scheduled', 'ended')
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from ASC, created_at ASC`,
    [companyId, employeeId, monthEndDate, monthStartDate],
  );

export const listAttendanceSummaries = (env: Env, companyId: string, employeeId: string, start: string, end: string) =>
  many<any>(
    env,
    `SELECT * FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [companyId, employeeId, start, end],
  );

export const listApprovedAttendanceCorrections = (env: Env, companyId: string, employeeId: string, start: string, end: string) =>
  many<any>(
    env,
    `SELECT c.* FROM attendance_corrections c
     LEFT JOIN attendance_events e ON e.id = c.attendance_event_id AND e.company_id = c.company_id
     WHERE c.company_id = ? AND c.employee_id = ? AND c.status = 'approved'
       AND substr(COALESCE(
         json_extract(c.new_value_json, '$.attendance_date'),
         json_extract(c.new_value_json, '$.event_time'),
         e.event_time,
         c.updated_at,
         c.created_at
       ), 1, 10) BETWEEN ? AND ?`,
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
      carry_forward_deduction_amount, status, source_type, source_id,
      calculation_code, calculation_description, calculation_metadata_json,
      generated_by_calculation, calculation_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      item.source_type ?? "payroll_calculation",
      item.source_id ?? item.payroll_run_id,
      item.calculation_code ?? "employee_payroll",
      item.calculation_description ?? "Generated employee payroll calculation.",
      item.calculation_metadata_json ?? null,
      item.generated_by_calculation ?? 1,
      item.calculation_version ?? 0,
      item.created_at,
      item.updated_at,
    ],
  );

export const createEarning = (env: Env, input: PayrollGeneratedEarning & { id: string; companyId: string; payrollItemId: string }) =>
  run(
    env,
    `INSERT INTO payroll_earnings (
      id, company_id, payroll_item_id, earning_type, amount, source_type, source_id,
      source_reference, calculation_code, calculation_description,
      calculation_metadata_json, generated_by_calculation, calculation_version,
      notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payrollItemId,
      input.earning_type,
      input.amount,
      input.source_type ?? null,
      input.source_id ?? null,
      input.source_reference ?? null,
      input.calculation_code ?? null,
      input.calculation_description ?? null,
      input.calculation_metadata_json ?? null,
      input.generated_by_calculation ?? 1,
      input.calculation_version ?? 0,
      input.notes ?? null,
      new Date().toISOString(),
    ],
  );

export const createDeduction = (env: Env, input: PayrollGeneratedDeduction & { id: string; companyId: string; payrollItemId: string }) =>
  run(
    env,
    `INSERT INTO payroll_deductions (
      id, company_id, payroll_item_id, deduction_type, amount, source_type, source_id,
      source_reference, calculation_code, calculation_description,
      calculation_metadata_json, generated_by_calculation, calculation_version,
      notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payrollItemId,
      input.deduction_type,
      input.amount,
      input.source_type ?? null,
      input.source_id ?? null,
      input.source_reference ?? null,
      input.calculation_code ?? null,
      input.calculation_description ?? null,
      input.calculation_metadata_json ?? null,
      input.generated_by_calculation ?? 1,
      input.calculation_version ?? 0,
      input.notes ?? null,
      new Date().toISOString(),
    ],
  );

export const persistRunCalculation = (
  env: Env,
  input: {
    companyId: string;
    runId: string;
    results: PayrollCalculationResult[];
    totals: { gross: number; deductions: number; net: number };
  },
) => {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM payroll_earnings WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1)").bind(input.companyId, input.companyId, input.runId),
    env.DB.prepare("DELETE FROM payroll_deductions WHERE company_id = ? AND payroll_item_id IN (SELECT id FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1)").bind(input.companyId, input.companyId, input.runId),
    env.DB.prepare("DELETE FROM payroll_items WHERE company_id = ? AND payroll_run_id = ? AND COALESCE(generated_by_calculation, 1) = 1").bind(input.companyId, input.runId),
    env.DB.prepare("DELETE FROM payroll_exceptions WHERE company_id = ? AND payroll_run_id = ?").bind(input.companyId, input.runId),
  ];

  for (const result of input.results) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO payroll_items (
          id, company_id, payroll_run_id, employee_id, outlet_id, basic_salary_amount,
          payable_basic_amount, gross_amount, total_deductions_amount, net_amount,
          carry_forward_deduction_amount, status, source_type, source_id,
          calculation_code, calculation_description, calculation_metadata_json,
          generated_by_calculation, calculation_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        result.item.id,
        result.item.company_id,
        result.item.payroll_run_id,
        result.item.employee_id,
        result.item.outlet_id,
        result.item.basic_salary_amount,
        result.item.payable_basic_amount,
        result.item.gross_amount,
        result.item.total_deductions_amount,
        result.item.net_amount,
        result.item.carry_forward_deduction_amount,
        result.item.status,
        result.item.source_type ?? "payroll_calculation",
        result.item.source_id ?? result.item.payroll_run_id,
        result.item.calculation_code ?? "employee_payroll",
        result.item.calculation_description ?? "Generated employee payroll calculation.",
        result.item.calculation_metadata_json ?? null,
        result.item.generated_by_calculation ?? 1,
        result.item.calculation_version ?? 0,
        result.item.created_at,
        result.item.updated_at,
      ),
    );
    for (const earning of result.earnings) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO payroll_earnings (
            id, company_id, payroll_item_id, earning_type, amount, source_type, source_id,
            source_reference, calculation_code, calculation_description,
            calculation_metadata_json, generated_by_calculation, calculation_version,
            notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          createPrefixedId("pay_earn"),
          input.companyId,
          result.item.id,
          earning.earning_type,
          earning.amount,
          earning.source_type ?? null,
          earning.source_id ?? null,
          earning.source_reference ?? null,
          earning.calculation_code ?? null,
          earning.calculation_description ?? null,
          earning.calculation_metadata_json ?? null,
          earning.generated_by_calculation ?? 1,
          earning.calculation_version ?? 0,
          earning.notes ?? null,
          new Date().toISOString(),
        ),
      );
    }
    for (const deduction of result.deductions) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO payroll_deductions (
            id, company_id, payroll_item_id, deduction_type, amount, source_type, source_id,
            source_reference, calculation_code, calculation_description,
            calculation_metadata_json, generated_by_calculation, calculation_version,
            notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          createPrefixedId("pay_ded"),
          input.companyId,
          result.item.id,
          deduction.deduction_type,
          deduction.amount,
          deduction.source_type ?? null,
          deduction.source_id ?? null,
          deduction.source_reference ?? null,
          deduction.calculation_code ?? null,
          deduction.calculation_description ?? null,
          deduction.calculation_metadata_json ?? null,
          deduction.generated_by_calculation ?? 1,
          deduction.calculation_version ?? 0,
          deduction.notes ?? null,
          new Date().toISOString(),
        ),
      );
    }
    for (const exception of result.exceptions) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO payroll_exceptions (
            id, company_id, payroll_run_id, employee_id, outlet_id, exception_type,
            severity, message, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        ).bind(
          createPrefixedId("pay_exc"),
          input.companyId,
          input.runId,
          exception.employee_id ?? null,
          exception.outlet_id ?? null,
          exception.exception_type,
          exception.severity,
          exception.message,
          new Date().toISOString(),
        ),
      );
    }
    for (const warning of result.warnings ?? []) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO payroll_exceptions (
            id, company_id, payroll_run_id, employee_id, outlet_id, exception_type,
            severity, message, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'warning', ?, 'open', ?)`,
        ).bind(
          createPrefixedId("pay_exc"),
          input.companyId,
          input.runId,
          result.item.employee_id,
          result.item.outlet_id,
          warning.warning_type,
          warning.message,
          new Date().toISOString(),
        ),
      );
    }
  }

  const now = new Date().toISOString();
  statements.push(
    env.DB.prepare(
      `UPDATE payroll_runs SET total_gross_amount = ?, total_deduction_amount = ?,
        total_net_amount = ?,
        status = CASE WHEN status IN ('draft', 'calculation_failed', 'failed') THEN 'calculated' ELSE status END,
        calculation_status = 'calculated', calculated_at = ?,
        updated_at = ? WHERE company_id = ? AND id = ?`,
    ).bind(input.totals.gross, input.totals.deductions, input.totals.net, now, now, input.companyId, input.runId),
  );

  return env.DB.batch(statements);
};

export const listRepaymentSourcesForRun = async (env: Env, companyId: string, runId: string) =>
  many<PayrollRepaymentSource>(
    env,
    `SELECT d.payroll_item_id,
       i.payroll_run_id,
       i.employee_id,
       d.source_type,
       d.source_id,
       d.amount,
       i.total_deductions_amount - COALESCE((
         SELECT SUM(nd.amount) FROM payroll_deductions nd
         WHERE nd.company_id = d.company_id
           AND nd.payroll_item_id = d.payroll_item_id
           AND COALESCE(nd.source_type, '') NOT IN ('salary_advance', 'salary_loan_installment')
       ), 0) AS item_total_deductions_amount,
       r.currency
     FROM payroll_deductions d
     JOIN payroll_items i ON i.id = d.payroll_item_id AND i.company_id = d.company_id
     JOIN payroll_runs r ON r.id = i.payroll_run_id AND r.company_id = i.company_id
     WHERE d.company_id = ? AND i.payroll_run_id = ?
       AND d.source_type IN ('salary_advance', 'salary_loan_installment')
       AND d.source_id IS NOT NULL
     ORDER BY i.employee_id ASC, d.created_at ASC, d.id ASC`,
    [companyId, runId],
  );

export const listExistingRepaymentApplications = async (env: Env, companyId: string, runId: string) =>
  many<{ source_type: string; source_id: string; applied_amount: number }>(
    env,
    `SELECT source_type, source_id, applied_amount
     FROM payroll_repayment_applications
     WHERE company_id = ? AND payroll_run_id = ?`,
    [companyId, runId],
  );

const snapshotOutletScope = (outletIds?: string[]) => {
  if (!outletIds) return { sql: "", values: [] as unknown[] };
  if (outletIds.length === 0) return { sql: " AND 1 = 0", values: [] as unknown[] };
  return {
    sql: ` AND i.outlet_id IN (${outletIds.map(() => "?").join(", ")})`,
    values: outletIds as unknown[],
  };
};

export const listPayslipSnapshotItemsForRun = (env: Env, companyId: string, runId: string, outletIds?: string[]) => {
  const scoped = snapshotOutletScope(outletIds);
  return many<any>(
    env,
    `SELECT i.*,
       e.employee_code,
       e.full_name AS employee_name,
       e.employee_type,
       e.department_id,
       e.position_id,
       o.name AS outlet_name,
       d.name AS department_name,
       p.title AS position_name,
       c.name AS company_name,
       c.legal_name AS company_legal_name
     FROM payroll_items i
     JOIN employees e ON e.id = i.employee_id AND e.company_id = i.company_id
     LEFT JOIN outlets o ON o.id = i.outlet_id
     LEFT JOIN departments d ON d.id = e.department_id AND d.company_id = e.company_id
     LEFT JOIN positions p ON p.id = e.position_id AND p.company_id = e.company_id
     LEFT JOIN companies c ON c.id = i.company_id
     WHERE i.company_id = ? AND i.payroll_run_id = ?
       ${scoped.sql}
     ORDER BY e.employee_code ASC`,
    [companyId, runId, ...scoped.values],
  );
};

export const listPayslipSnapshotEarningsForRun = (env: Env, companyId: string, runId: string, outletIds?: string[]) => {
  const scoped = snapshotOutletScope(outletIds);
  return many<any>(
    env,
    `SELECT pe.*
     FROM payroll_earnings pe
     JOIN payroll_items i ON i.id = pe.payroll_item_id AND i.company_id = pe.company_id
     WHERE pe.company_id = ? AND i.payroll_run_id = ?
       ${scoped.sql}
     ORDER BY pe.payroll_item_id ASC, pe.created_at ASC, pe.id ASC`,
    [companyId, runId, ...scoped.values],
  );
};

export const listPayslipSnapshotDeductionsForRun = (env: Env, companyId: string, runId: string, outletIds?: string[]) => {
  const scoped = snapshotOutletScope(outletIds);
  return many<any>(
    env,
    `SELECT pd.*
     FROM payroll_deductions pd
     JOIN payroll_items i ON i.id = pd.payroll_item_id AND i.company_id = pd.company_id
     WHERE pd.company_id = ? AND i.payroll_run_id = ?
       ${scoped.sql}
     ORDER BY pd.payroll_item_id ASC, pd.created_at ASC, pd.id ASC`,
    [companyId, runId, ...scoped.values],
  );
};

export const listPayrollItemsNeedingPayslipSnapshots = (env: Env, companyId: string, payrollRunId: string, outletIds?: string[]) => {
  const scope = snapshotOutletScope(outletIds);
  return many<any>(
    env,
    `SELECT i.* FROM payroll_items i
     WHERE i.company_id = ? AND i.payroll_run_id = ?
       ${scope.sql}
       AND NOT EXISTS (
         SELECT 1 FROM payslips p
         WHERE p.company_id = i.company_id
           AND p.payroll_run_id = i.payroll_run_id
           AND p.employee_id = i.employee_id
           AND p.payroll_item_id = i.id
           AND p.status = 'finalized'
           AND p.snapshot_json IS NOT NULL
           AND p.employee_snapshot_json IS NOT NULL
           AND p.company_snapshot_json IS NOT NULL
           AND p.period_snapshot_json IS NOT NULL
           AND p.earnings_json IS NOT NULL
           AND p.deductions_json IS NOT NULL
           AND p.totals_json IS NOT NULL
           AND p.finalized_at IS NOT NULL
       )`,
    [companyId, payrollRunId, ...scope.values],
  );
};

export const countItemsForRun = async (env: Env, companyId: string, runId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM payroll_items WHERE company_id = ? AND payroll_run_id = ?",
    [companyId, runId],
  );
  return row?.total ?? 0;
};

export const finalizeRunBatch = (
  env: Env,
  input: {
    companyId: string;
    run: PayrollRunRecord;
    actorId: string;
    finalizedAt: string;
    repaymentApplications: Array<{
      id: string;
      payrollItemId: string;
      employeeId: string;
      sourceType: string;
      sourceId: string;
      appliedAmount: number;
      currency: string;
    }>;
    payslipSnapshots: Array<{
      id: string;
      payrollItemId: string;
      employeeId: string;
      snapshotJson: string;
      employeeSnapshotJson: string;
      companySnapshotJson: string;
      periodSnapshotJson: string;
      earningsJson: string;
      deductionsJson: string;
      nonCashBenefitsJson: string;
      totalsJson: string;
      calculationVersion: number;
    }>;
  },
) => {
  const now = input.finalizedAt;
  const statements: D1PreparedStatement[] = [];

  for (const repayment of input.repaymentApplications) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO payroll_repayment_applications (
          id, company_id, payroll_run_id, payroll_item_id, employee_id,
          source_type, source_id, applied_amount, currency, applied_at,
          created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        repayment.id,
        input.companyId,
        input.run.id,
        repayment.payrollItemId,
        repayment.employeeId,
        repayment.sourceType,
        repayment.sourceId,
        repayment.appliedAmount,
        repayment.currency,
        now,
        input.actorId,
        now,
      ),
    );

    if (repayment.sourceType === "salary_advance") {
      statements.push(
        env.DB.prepare(
          `UPDATE advance_payments
           SET repaid_amount = MIN(amount, COALESCE(repaid_amount, 0) + ?),
             status = CASE WHEN MIN(amount, COALESCE(repaid_amount, 0) + ?) >= amount THEN 'paid' ELSE status END,
             repaid_at = CASE WHEN MIN(amount, COALESCE(repaid_amount, 0) + ?) >= amount THEN ? ELSE repaid_at END,
             updated_at = ?
           WHERE company_id = ? AND id = ?`,
        ).bind(
          repayment.appliedAmount,
          repayment.appliedAmount,
          repayment.appliedAmount,
          now,
          now,
          input.companyId,
          repayment.sourceId,
        ),
      );
    }

    if (repayment.sourceType === "salary_loan_installment") {
      statements.push(
        env.DB.prepare(
          `UPDATE salary_loan_installments
           SET paid_amount = MIN(amount, COALESCE(paid_amount, 0) + ?),
             status = CASE WHEN MIN(amount, COALESCE(paid_amount, 0) + ?) >= amount THEN 'paid' ELSE 'partial' END,
             paid_at = CASE WHEN MIN(amount, COALESCE(paid_amount, 0) + ?) >= amount THEN ? ELSE paid_at END,
             payroll_item_id = COALESCE(payroll_item_id, ?),
             updated_at = ?
           WHERE company_id = ? AND id = ?`,
        ).bind(
          repayment.appliedAmount,
          repayment.appliedAmount,
          repayment.appliedAmount,
          now,
          repayment.payrollItemId,
          now,
          input.companyId,
          repayment.sourceId,
        ),
      );
      statements.push(
        env.DB.prepare(
          `UPDATE salary_loans
           SET outstanding_amount = MAX(0, outstanding_amount - ?),
             status = CASE WHEN MAX(0, outstanding_amount - ?) = 0 THEN 'settled' ELSE status END,
             updated_at = ?
           WHERE company_id = ?
             AND id = (SELECT salary_loan_id FROM salary_loan_installments WHERE company_id = ? AND id = ?)`,
        ).bind(
          repayment.appliedAmount,
          repayment.appliedAmount,
          now,
          input.companyId,
          input.companyId,
          repayment.sourceId,
        ),
      );
    }
  }

  for (const snapshot of input.payslipSnapshots) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO payslips (
          id, company_id, payroll_run_id, payroll_item_id, employee_id,
          file_key, status, generated_by, generated_at, downloaded_at,
          snapshot_json, employee_snapshot_json, company_snapshot_json,
          period_snapshot_json, earnings_json, deductions_json, non_cash_benefits_json,
          totals_json, calculation_version, finalized_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 'finalized', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        snapshot.id,
        input.companyId,
        input.run.id,
        snapshot.payrollItemId,
        snapshot.employeeId,
        input.actorId,
        now,
        snapshot.snapshotJson,
        snapshot.employeeSnapshotJson,
        snapshot.companySnapshotJson,
        snapshot.periodSnapshotJson,
        snapshot.earningsJson,
        snapshot.deductionsJson,
        snapshot.nonCashBenefitsJson,
        snapshot.totalsJson,
        snapshot.calculationVersion,
        now,
      ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE payslips
         SET status = 'finalized',
           snapshot_json = COALESCE(snapshot_json, ?),
           employee_snapshot_json = COALESCE(employee_snapshot_json, ?),
           company_snapshot_json = COALESCE(company_snapshot_json, ?),
           period_snapshot_json = COALESCE(period_snapshot_json, ?),
           earnings_json = COALESCE(earnings_json, ?),
           deductions_json = COALESCE(deductions_json, ?),
           non_cash_benefits_json = COALESCE(non_cash_benefits_json, ?),
           totals_json = COALESCE(totals_json, ?),
           calculation_version = COALESCE(calculation_version, ?),
           finalized_at = COALESCE(finalized_at, ?)
         WHERE company_id = ? AND payroll_item_id = ?`,
      ).bind(
        snapshot.snapshotJson,
        snapshot.employeeSnapshotJson,
        snapshot.companySnapshotJson,
        snapshot.periodSnapshotJson,
        snapshot.earningsJson,
        snapshot.deductionsJson,
        snapshot.nonCashBenefitsJson,
        snapshot.totalsJson,
        snapshot.calculationVersion,
        now,
        input.companyId,
        snapshot.payrollItemId,
      ),
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE payroll_runs
       SET status = 'finalized',
         finalized_by = ?,
         finalized_at = ?,
         locked_by = ?,
         locked_at = ?,
         updated_at = ?
       WHERE company_id = ? AND id = ? AND status = 'finalizing'`,
    ).bind(input.actorId, now, input.actorId, now, now, input.companyId, input.run.id),
  );

  statements.push(
    env.DB.prepare(
      "UPDATE attendance_daily_summary SET payroll_status = 'locked', updated_at = ? WHERE company_id = ? AND attendance_date BETWEEN ? AND ?",
    ).bind(now, input.companyId, `${input.run.payroll_month}-01`, `${input.run.payroll_month}-31`),
  );

  return env.DB.batch(statements);
};

export const upsertPayslipSnapshots = (
  env: Env,
  input: {
    companyId: string;
    run: PayrollRunRecord;
    actorId: string;
    finalizedAt: string;
    payslipSnapshots: Array<{
      id: string;
      payrollItemId: string;
      employeeId: string;
      snapshotJson: string;
      employeeSnapshotJson: string;
      companySnapshotJson: string;
      periodSnapshotJson: string;
      earningsJson: string;
      deductionsJson: string;
      nonCashBenefitsJson: string;
      totalsJson: string;
      calculationVersion: number;
    }>;
  },
) => {
  const statements: D1PreparedStatement[] = [];

  for (const snapshot of input.payslipSnapshots) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO payslips (
          id, company_id, payroll_run_id, payroll_item_id, employee_id,
          file_key, status, generated_by, generated_at, downloaded_at,
          snapshot_json, employee_snapshot_json, company_snapshot_json,
          period_snapshot_json, earnings_json, deductions_json, non_cash_benefits_json,
          totals_json, calculation_version, finalized_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 'finalized', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        snapshot.id,
        input.companyId,
        input.run.id,
        snapshot.payrollItemId,
        snapshot.employeeId,
        input.actorId,
        input.finalizedAt,
        snapshot.snapshotJson,
        snapshot.employeeSnapshotJson,
        snapshot.companySnapshotJson,
        snapshot.periodSnapshotJson,
        snapshot.earningsJson,
        snapshot.deductionsJson,
        snapshot.nonCashBenefitsJson,
        snapshot.totalsJson,
        snapshot.calculationVersion,
        input.finalizedAt,
      ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE payslips
         SET status = 'finalized',
           snapshot_json = COALESCE(snapshot_json, ?),
           employee_snapshot_json = COALESCE(employee_snapshot_json, ?),
           company_snapshot_json = COALESCE(company_snapshot_json, ?),
           period_snapshot_json = COALESCE(period_snapshot_json, ?),
           earnings_json = COALESCE(earnings_json, ?),
           deductions_json = COALESCE(deductions_json, ?),
           non_cash_benefits_json = COALESCE(non_cash_benefits_json, ?),
           totals_json = COALESCE(totals_json, ?),
           calculation_version = COALESCE(calculation_version, ?),
           finalized_at = COALESCE(finalized_at, ?)
         WHERE company_id = ? AND payroll_run_id = ? AND employee_id = ?`,
      ).bind(
        snapshot.snapshotJson,
        snapshot.employeeSnapshotJson,
        snapshot.companySnapshotJson,
        snapshot.periodSnapshotJson,
        snapshot.earningsJson,
        snapshot.deductionsJson,
        snapshot.nonCashBenefitsJson,
        snapshot.totalsJson,
        snapshot.calculationVersion,
        input.finalizedAt,
        input.companyId,
        input.run.id,
        snapshot.employeeId,
      ),
    );
  }

  return statements.length > 0 ? env.DB.batch(statements) : Promise.resolve([]);
};

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
       AND e.employment_status NOT IN ('archived', 'terminated', 'resigned', 'retired', 'inactive')
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
       AND e.employment_status NOT IN ('archived', 'terminated', 'resigned', 'retired', 'inactive')
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

export const findApprovalRequest = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    "SELECT * FROM approval_requests WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const updateApprovalRequestStatus = (
  env: Env,
  companyId: string,
  id: string,
  status: string,
) =>
  run(
    env,
    "UPDATE approval_requests SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, new Date().toISOString(), companyId, id],
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
