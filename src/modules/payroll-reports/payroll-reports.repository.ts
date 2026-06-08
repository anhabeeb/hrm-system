import type { AuthActor } from "../../types/api.types";
import type { PayrollReportFilters, PayrollReportPagination } from "./payroll-reports.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const pageOffset = (filters: PayrollReportFilters) => (filters.page - 1) * filters.page_size;

const paginate = async (
  env: Env,
  sql: string,
  values: readonly unknown[],
  filters: PayrollReportFilters,
): Promise<{ rows: Array<Record<string, unknown>>; pagination: PayrollReportPagination }> => {
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM (${sql}) payroll_report_rows`, values);
  const rows = await many<Record<string, unknown>>(
    env,
    `${sql} LIMIT ? OFFSET ?`,
    [...values, filters.page_size, pageOffset(filters)],
  );
  const totalRows = Number(total?.total ?? 0);
  return {
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total: totalRows,
      total_pages: totalRows === 0 ? 0 : Math.ceil(totalRows / filters.page_size),
    },
  };
};

const employeeScope = (context: AuthActor, filters: PayrollReportFilters, employeeAlias = "e") => {
  const clauses: string[] = [`${employeeAlias}.company_id = ?`];
  const values: unknown[] = [context.companyId];

  if (!filters.include_archived) clauses.push(`${employeeAlias}.deleted_at IS NULL`);
  if (filters.employee_id) { clauses.push(`${employeeAlias}.id = ?`); values.push(filters.employee_id); }

  if (context.isSuperAdmin || context.isAdmin) {
    if (filters.outlet_id) { clauses.push(`${employeeAlias}.primary_outlet_id = ?`); values.push(filters.outlet_id); }
  } else if (filters.outlet_id) {
    if (!context.outletIds.includes(filters.outlet_id)) clauses.push("1 = 0");
    else { clauses.push(`${employeeAlias}.primary_outlet_id = ?`); values.push(filters.outlet_id); }
  } else if (context.outletIds.length > 0) {
    clauses.push(`${employeeAlias}.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")})`);
    values.push(...context.outletIds);
  } else {
    clauses.push("1 = 0");
  }

  if (filters.department_id) { clauses.push(`${employeeAlias}.department_id = ?`); values.push(filters.department_id); }
  if (filters.position_id) { clauses.push(`${employeeAlias}.position_id = ?`); values.push(filters.position_id); }
  if (filters.employee_type && filters.employee_type !== "all") { clauses.push(`${employeeAlias}.employee_type = ?`); values.push(filters.employee_type); }
  if (filters.search) {
    clauses.push(`(${employeeAlias}.employee_code LIKE ? OR ${employeeAlias}.full_name LIKE ?)`);
    const search = `%${filters.search}%`;
    values.push(search, search);
  }
  return { sql: clauses.join(" AND "), values };
};

const employeeJoins = `
  LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
  LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
  LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id`;

const employeeColumns = `
  e.id AS employee_id,
  e.employee_code,
  e.full_name AS employee_name,
  e.primary_outlet_id AS outlet_id,
  COALESCE(o.name, 'Unassigned') AS outlet_name,
  e.department_id,
  COALESCE(d.name, 'Unassigned') AS department_name,
  e.position_id,
  COALESCE(p.title, 'Unassigned') AS position_name`;

const amount = (expression: string, canViewSensitive: boolean) => canViewSensitive ? expression : "NULL";

const runFilters = (filters: PayrollReportFilters, runAlias = "pr") => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.payroll_run_id) { clauses.push(`${runAlias}.id = ?`); values.push(filters.payroll_run_id); }
  if (filters.payroll_month) { clauses.push(`${runAlias}.payroll_month = ?`); values.push(filters.payroll_month); }
  if (filters.payroll_status) { clauses.push(`${runAlias}.status = ?`); values.push(filters.payroll_status); }
  if (filters.from_date) { clauses.push(`${runAlias}.payroll_month >= substr(?, 1, 7)`); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push(`${runAlias}.payroll_month <= substr(?, 1, 7)`); values.push(filters.to_date); }
  return { sql: clauses.length ? clauses.join(" AND ") : "1 = 1", values };
};

const periodWhere = (filters: PayrollReportFilters, dateExpression: string) => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.payroll_month) { clauses.push(`substr(${dateExpression}, 1, 7) = ?`); values.push(filters.payroll_month); }
  if (filters.from_date) { clauses.push(`${dateExpression} >= ?`); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push(`${dateExpression} <= ?`); values.push(filters.to_date); }
  return { sql: clauses.length ? clauses.join(" AND ") : "1 = 1", values };
};

const payrollItemBase = (context: AuthActor, filters: PayrollReportFilters) => {
  const scope = employeeScope(context, filters);
  const run = runFilters(filters);
  const where = [`pi.company_id = ?`, scope.sql, run.sql];
  const values = [context.companyId, ...scope.values, ...run.values];
  return { where: where.join(" AND "), values };
};

const moneyRestrictedColumn = (canViewSensitive: boolean) => canViewSensitive ? "0 AS amounts_restricted" : "1 AS amounts_restricted";

const needsEmployeeScopedRows = (context: AuthActor, filters: PayrollReportFilters) =>
  !(context.isSuperAdmin || context.isAdmin)
  || Boolean(filters.employee_id || filters.outlet_id || filters.department_id || filters.position_id || filters.employee_type || filters.search);

const payrollRunEmployeeScope = (context: AuthActor, filters: PayrollReportFilters, runAlias = "pr") => {
  if (!needsEmployeeScopedRows(context, filters)) return { sql: "1 = 1", values: [] as unknown[] };
  const scope = employeeScope(context, filters, "e");
  return {
    sql: `EXISTS (
      SELECT 1
      FROM payroll_items scoped_pi
      JOIN employees e ON e.company_id = scoped_pi.company_id AND e.id = scoped_pi.employee_id
      WHERE scoped_pi.company_id = ${runAlias}.company_id
        AND scoped_pi.payroll_run_id = ${runAlias}.id
        AND ${scope.sql}
    )`,
    values: scope.values,
  };
};

const auditEmployeeScope = (context: AuthActor, filters: PayrollReportFilters) => {
  if (!needsEmployeeScopedRows(context, filters)) return { sql: "1 = 1", values: [] as unknown[] };
  const scope = employeeScope(context, filters, "e");
  return {
    sql: `EXISTS (
      SELECT 1
      FROM employees e
      WHERE ${scope.sql}
        AND (
          e.id = al.employee_id
          OR EXISTS (
            SELECT 1 FROM payroll_runs scoped_pr
            JOIN payroll_items scoped_pi ON scoped_pi.company_id = scoped_pr.company_id AND scoped_pi.payroll_run_id = scoped_pr.id
            WHERE scoped_pr.company_id = al.company_id
              AND scoped_pr.id = al.entity_id
              AND scoped_pi.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('payroll_run', 'payroll')
          )
          OR EXISTS (
            SELECT 1 FROM payroll_items scoped_pi
            WHERE scoped_pi.company_id = al.company_id
              AND scoped_pi.id = al.entity_id
              AND scoped_pi.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('payroll_item', 'payroll_record')
          )
          OR EXISTS (
            SELECT 1 FROM payslips scoped_ps
            WHERE scoped_ps.company_id = al.company_id
              AND scoped_ps.id = al.entity_id
              AND scoped_ps.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('payslip', 'payslips')
          )
          OR EXISTS (
            SELECT 1 FROM advance_payments scoped_adv
            WHERE scoped_adv.company_id = al.company_id
              AND scoped_adv.id = al.entity_id
              AND scoped_adv.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('advance', 'advance_payment', 'advance_payments')
          )
          OR EXISTS (
            SELECT 1 FROM salary_loans scoped_loan
            WHERE scoped_loan.company_id = al.company_id
              AND scoped_loan.id = al.entity_id
              AND scoped_loan.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('salary_loan', 'salary_loans')
          )
          OR EXISTS (
            SELECT 1 FROM long_leave_payroll_impacts scoped_lli
            WHERE scoped_lli.company_id = al.company_id
              AND scoped_lli.id = al.entity_id
              AND scoped_lli.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('long_leave_payroll_impact', 'long_leave_payroll_impacts')
          )
          OR EXISTS (
            SELECT 1 FROM employee_salary_history scoped_salary
            WHERE scoped_salary.company_id = al.company_id
              AND scoped_salary.id = al.entity_id
              AND scoped_salary.employee_id = e.id
              AND COALESCE(al.entity_type, '') IN ('salary_history', 'employee_salary_history', 'salary')
          )
        )
    )`,
    values: scope.values,
  };
};

const deductionSum = (typeMatch: string, canViewSensitive: boolean) =>
  amount(`COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND ${typeMatch}), 0)`, canViewSensitive);

const earningSum = (typeMatch: string, canViewSensitive: boolean) =>
  amount(`COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND ${typeMatch}), 0)`, canViewSensitive);

export const getCurrency = async (env: Env, companyId: string) => {
  const row = await one<{ currency: string | null }>(env, "SELECT currency FROM companies WHERE id = ? LIMIT 1", [companyId]);
  return row?.currency ?? "MVR";
};

export const monthlySummary = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  return paginate(env, `SELECT pr.payroll_month,
      pr.id AS payroll_run_id,
      pr.status AS payroll_status,
      COUNT(DISTINCT pi.employee_id) AS total_employees,
      ${amount("SUM(pi.gross_amount)", canViewSensitive)} AS total_gross_salary,
      ${amount("SUM(COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND pe.earning_type IN ('allowance', 'recurring_allowance', 'cash_benefit')), 0))", canViewSensitive)} AS total_allowances,
      ${amount("SUM(pi.total_deductions_amount)", canViewSensitive)} AS total_deductions,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.deduction_type = 'advance' OR pd.source_type = 'advance')), 0))", canViewSensitive)} AS total_advances_deducted,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.deduction_type IN ('salary_loan', 'loan') OR pd.source_type = 'salary_loan')), 0))", canViewSensitive)} AS total_salary_loan_deductions,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.deduction_type LIKE '%attendance%' OR pd.source_type = 'attendance')), 0))", canViewSensitive)} AS total_attendance_deductions,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.deduction_type LIKE '%long_leave%' OR pd.source_type = 'long_leave')), 0))", canViewSensitive)} AS total_long_leave_deductions,
      ${amount("SUM(COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND (pe.earning_type LIKE '%overtime%' OR pe.source_type = 'overtime')), 0))", canViewSensitive)} AS total_overtime_amount,
      ${amount("SUM(pi.net_amount)", canViewSensitive)} AS total_net_salary_payable,
      pr.calculated_by AS prepared_by,
      pr.approved_by,
      pr.finalized_by,
      pr.calculated_at AS generated_at,
      pr.finalized_at,
      COALESCE((SELECT COUNT(*) FROM payroll_exceptions x WHERE x.company_id = pr.company_id AND x.payroll_run_id = pr.id AND x.status = 'open'), 0) AS warnings_count,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_runs pr
    JOIN payroll_items pi ON pi.company_id = pr.company_id AND pi.payroll_run_id = pr.id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    WHERE ${base.where}
    GROUP BY pr.id, pr.payroll_month, pr.status, pr.calculated_by, pr.approved_by, pr.finalized_by, pr.calculated_at, pr.finalized_at
    ORDER BY pr.payroll_month DESC`, base.values, filters);
};

export const employeeDetail = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  const payslipStatus = filters.payslip_status ? " AND COALESCE(ps.status, 'missing') = ?" : "";
  const values = [...base.values, ...(filters.payslip_status ? [filters.payslip_status] : [])];
  return paginate(env, `SELECT ${employeeColumns},
      pr.payroll_month,
      pr.id AS payroll_run_id,
      ${amount("pi.basic_salary_amount", canViewSensitive)} AS base_salary,
      ${amount("pi.gross_amount", canViewSensitive)} AS gross_salary,
      ${earningSum("pe.earning_type IN ('allowance', 'recurring_allowance', 'cash_benefit')", canViewSensitive)} AS allowances,
      ${earningSum("pe.earning_type LIKE '%overtime%' OR pe.source_type = 'overtime'", canViewSensitive)} AS overtime_amount,
      ${amount("pi.total_deductions_amount", canViewSensitive)} AS total_deductions,
      ${deductionSum("pd.deduction_type = 'advance' OR pd.source_type = 'advance'", canViewSensitive)} AS advance_deduction,
      ${deductionSum("pd.deduction_type IN ('salary_loan', 'loan') OR pd.source_type = 'salary_loan'", canViewSensitive)} AS loan_deduction,
      ${deductionSum("pd.deduction_type LIKE '%attendance%' OR pd.source_type = 'attendance'", canViewSensitive)} AS attendance_deduction,
      ${deductionSum("pd.deduction_type LIKE '%long_leave%' OR pd.source_type = 'long_leave'", canViewSensitive)} AS long_leave_deduction,
      ${deductionSum("pd.deduction_type LIKE '%unpaid_leave%' OR pd.source_type = 'leave'", canViewSensitive)} AS unpaid_leave_deduction,
      ${amount("pi.net_amount", canViewSensitive)} AS net_payable_salary,
      pi.status AS payroll_status,
      COALESCE(ps.status, 'missing') AS payslip_status,
      ${canViewSensitive ? "COALESCE(e.bank_account_masked, e.bank_name, 'not_recorded')" : "NULL"} AS payment_method_summary,
      COALESCE((SELECT COUNT(*) FROM payroll_exceptions x WHERE x.company_id = pi.company_id AND x.payroll_run_id = pr.id AND x.employee_id = pi.employee_id AND x.status = 'open'), 0) AS warnings_count,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    LEFT JOIN payslips ps ON ps.company_id = pi.company_id AND ps.payroll_item_id = pi.id
    WHERE ${base.where}${payslipStatus}
    ORDER BY pr.payroll_month DESC, e.employee_code`, values, filters);
};

export const salaryCompensation = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT ${employeeColumns},
      ${amount("(SELECT h.monthly_salary_amount FROM employee_salary_history h WHERE h.company_id = e.company_id AND h.employee_id = e.id AND h.effective_from <= date('now') ORDER BY h.effective_from DESC, h.created_at DESC LIMIT 1)", canViewSensitive)} AS base_salary,
      (SELECT h.effective_from FROM employee_salary_history h WHERE h.company_id = e.company_id AND h.employee_id = e.id AND h.effective_from <= date('now') ORDER BY h.effective_from DESC, h.created_at DESC LIMIT 1) AS salary_effective_date,
      CASE WHEN EXISTS (SELECT 1 FROM employee_salary_history h WHERE h.company_id = e.company_id AND h.employee_id = e.id) THEN 'active' ELSE 'missing' END AS salary_status,
      (SELECT MAX(h.effective_from) FROM employee_salary_history h WHERE h.company_id = e.company_id AND h.employee_id = e.id) AS last_salary_change,
      CASE WHEN EXISTS (SELECT 1 FROM approval_requests ar WHERE ar.company_id = e.company_id AND ar.employee_id = e.id AND ar.module = 'salary' AND ar.status IN ('pending', 'in_progress')) THEN 'pending_approval' ELSE 'none' END AS pending_salary_change,
      ${canViewSensitive ? "(SELECT group_concat(component.component_name || ':' || component.amount, ', ') FROM employee_compensation_components component WHERE component.company_id = e.company_id AND component.employee_id = e.id AND component.status IN ('active', 'scheduled', 'pending_approval'))" : "NULL"} AS compensation_component_summary,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
    ORDER BY e.employee_code`, scope.values, filters);
};

export const salaryChanges = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const period = periodWhere(filters, "h.effective_from");
  return paginate(env, `SELECT ${employeeColumns},
      ${amount("(SELECT prev.monthly_salary_amount FROM employee_salary_history prev WHERE prev.company_id = h.company_id AND prev.employee_id = h.employee_id AND prev.effective_from < h.effective_from ORDER BY prev.effective_from DESC LIMIT 1)", canViewSensitive)} AS old_salary,
      ${amount("h.monthly_salary_amount", canViewSensitive)} AS new_salary,
      h.effective_from AS effective_date,
      substr(COALESCE(h.reason, ''), 1, 120) AS change_reason,
      ar.decision_by AS approved_by,
      h.created_by,
      COALESCE(ar.status, 'applied') AS status,
      h.approval_request_id AS audit_reference,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM employee_salary_history h
    JOIN employees e ON e.company_id = h.company_id AND e.id = h.employee_id
    ${employeeJoins}
    LEFT JOIN approval_requests ar ON ar.company_id = h.company_id AND ar.id = h.approval_request_id
    WHERE ${scope.sql} AND ${period.sql}
    ORDER BY h.effective_from DESC, e.employee_code`, [...scope.values, ...period.values], filters);
};

export const deductions = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  const extra = filters.deduction_type ? " AND pd.deduction_type = ?" : "";
  const values = [...base.values, ...(filters.deduction_type ? [filters.deduction_type] : [])];
  return paginate(env, `SELECT ${employeeColumns},
      pr.payroll_month,
      pd.deduction_type,
      COALESCE(pd.source_type, 'manual') AS deduction_source,
      ${amount("pd.amount", canViewSensitive)} AS deduction_amount,
      pi.status,
      COALESCE(pd.source_reference, pd.source_id) AS source_reference,
      substr(COALESCE(pd.notes, pd.calculation_description, ''), 1, 120) AS reason,
      pd.created_at,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_deductions pd
    JOIN payroll_items pi ON pi.company_id = pd.company_id AND pi.id = pd.payroll_item_id
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    WHERE ${base.where}${extra}
    ORDER BY pr.payroll_month DESC, e.employee_code, pd.deduction_type`, values, filters);
};

export const advances = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const period = periodWhere(filters, "a.paid_date");
  const status = filters.payment_status ? " AND a.status = ?" : "";
  return paginate(env, `SELECT ${employeeColumns},
      ${amount("a.amount", canViewSensitive)} AS advance_amount,
      a.paid_date AS advance_date,
      a.deduction_month AS payroll_deduction_month,
      ${amount("COALESCE(a.repaid_amount, 0)", canViewSensitive)} AS deducted_amount,
      ${amount("MAX(a.amount - COALESCE(a.repaid_amount, 0), 0)", canViewSensitive)} AS remaining_balance,
      a.status AS approval_status,
      substr(COALESCE(a.reason, ''), 1, 120) AS reason,
      a.created_by,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM advance_payments a
    JOIN employees e ON e.company_id = a.company_id AND e.id = a.employee_id
    ${employeeJoins}
    WHERE ${scope.sql} AND ${period.sql}${status}
    ORDER BY a.paid_date DESC`, [...scope.values, ...period.values, ...(filters.payment_status ? [filters.payment_status] : [])], filters);
};

export const salaryLoans = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const monthClause = filters.payroll_month ? " AND (row_i.payroll_month = ? OR l.start_month = ?)" : "";
  const asOf = filters.to_date ?? (filters.payroll_month ? `${filters.payroll_month}-31` : new Date().toISOString().slice(0, 10));
  const status = filters.payment_status ? " AND l.status = ?" : "";
  return paginate(env, `SELECT ${employeeColumns},
      ${amount("l.loan_amount", canViewSensitive)} AS loan_amount,
      ${amount("l.installment_amount", canViewSensitive)} AS installment_amount,
      ${amount("COALESCE(SUM(row_i.paid_amount), 0)", canViewSensitive)} AS paid_this_month,
      ${amount("COALESCE((SELECT SUM(all_i.paid_amount) FROM salary_loan_installments all_i WHERE all_i.company_id = l.company_id AND all_i.salary_loan_id = l.id AND COALESCE(all_i.paid_at, all_i.payroll_month || '-01') <= ?), 0)", canViewSensitive)} AS total_paid_to_date,
      ${amount("l.outstanding_amount", canViewSensitive)} AS remaining_balance,
      COALESCE(row_i.payroll_month, l.start_month) AS payroll_month,
      l.status AS loan_status,
      l.start_month AS start_date,
      MAX(row_i.payroll_month) AS end_date,
      COALESCE(ar.status, l.status) AS approval_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM salary_loans l
    JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
    ${employeeJoins}
    LEFT JOIN salary_loan_installments row_i ON row_i.company_id = l.company_id AND row_i.salary_loan_id = l.id
    LEFT JOIN approval_requests ar ON ar.company_id = l.company_id AND ar.id = l.approval_request_id
    WHERE ${scope.sql}${monthClause}${status}
    GROUP BY e.id, l.id, row_i.payroll_month, ar.status
    ORDER BY COALESCE(row_i.payroll_month, l.start_month) DESC`, [
      asOf,
      ...scope.values,
      ...(filters.payroll_month ? [filters.payroll_month, filters.payroll_month] : []),
      ...(filters.payment_status ? [filters.payment_status] : []),
    ], filters);
};

export const attendanceDeductions = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const period = periodWhere(filters, "s.attendance_date");
  return paginate(env, `SELECT ${employeeColumns},
      substr(s.attendance_date, 1, 7) AS payroll_month,
      SUM(CASE WHEN s.status IN ('absent', 'missing_clock_in', 'missing_check_in') THEN 1 ELSE 0 END) AS absent_days,
      SUM(CASE WHEN s.status = 'unpaid_leave' THEN 1 ELSE 0 END) AS unpaid_leave_days,
      SUM(CASE WHEN s.status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout') THEN 1 ELSE 0 END) AS missing_punch_days,
      ${amount("COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd JOIN payroll_items pi ON pi.company_id = pd.company_id AND pi.id = pd.payroll_item_id JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id WHERE pd.company_id = e.company_id AND pi.employee_id = e.id AND pr.payroll_month = substr(s.attendance_date, 1, 7) AND (pd.deduction_type LIKE '%attendance%' OR pd.source_type = 'attendance')), 0)", canViewSensitive)} AS attendance_deduction_amount,
      SUM(CASE WHEN s.status IN ('conflict', 'missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout') OR s.payroll_status IN ('exception', 'pending_review') THEN 1 ELSE 0 END) AS attendance_exception_warnings,
      COALESCE(MAX(s.payroll_status), 'pending') AS payroll_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM attendance_daily_summary s
    JOIN employees e ON e.company_id = s.company_id AND e.id = s.employee_id
    ${employeeJoins}
    WHERE ${scope.sql} AND ${period.sql}
    GROUP BY e.id, substr(s.attendance_date, 1, 7)
    ORDER BY payroll_month DESC, e.employee_code`, [...scope.values, ...period.values], filters);
};

export const overtime = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const period = periodWhere(filters, "s.attendance_date");
  return paginate(env, `SELECT ${employeeColumns},
      substr(s.attendance_date, 1, 7) AS payroll_month,
      SUM(COALESCE(s.overtime_minutes, 0)) AS overtime_minutes,
      ROUND(SUM(COALESCE(s.overtime_minutes, 0)) / 60.0, 2) AS overtime_hours,
      'approved_if_in_payroll' AS approval_status,
      ${amount("COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe JOIN payroll_items pi ON pi.company_id = pe.company_id AND pi.id = pe.payroll_item_id JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id WHERE pe.company_id = e.company_id AND pi.employee_id = e.id AND pr.payroll_month = substr(s.attendance_date, 1, 7) AND (pe.earning_type LIKE '%overtime%' OR pe.source_type = 'overtime')), 0)", canViewSensitive)} AS overtime_amount,
      MAX(CASE WHEN COALESCE(s.is_holiday, 0) = 1 AND COALESCE(s.worked_minutes, 0) > 0 THEN 1 ELSE 0 END) AS holiday_overtime,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM attendance_daily_summary s
    JOIN employees e ON e.company_id = s.company_id AND e.id = s.employee_id
    ${employeeJoins}
    WHERE ${scope.sql} AND ${period.sql} AND COALESCE(s.overtime_minutes, 0) > 0
    GROUP BY e.id, substr(s.attendance_date, 1, 7)
    ORDER BY payroll_month DESC, overtime_minutes DESC`, [...scope.values, ...period.values], filters);
};

export const longLeaveDeductions = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const month = filters.payroll_month ? " AND i.payroll_month = ?" : "";
  const period = !filters.payroll_month ? periodWhere(filters, "i.period_start") : { sql: "1 = 1", values: [] as unknown[] };
  return paginate(env, `SELECT ${employeeColumns},
      ll.id AS long_leave_id,
      i.payroll_month,
      ll.start_date,
      ll.expected_return_date AS end_date,
      i.total_days,
      i.long_leave_days,
      i.payable_days,
      i.unpaid_days,
      COALESCE(i.holiday_days, 0) AS holiday_days,
      COALESCE(i.payable_holiday_days, 0) AS payable_holiday_days,
      ${amount("i.deduction_amount", canViewSensitive)} AS deduction_amount,
      ${amount("i.payable_salary", canViewSensitive)} AS payable_salary,
      i.status AS payroll_review_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM long_leave_payroll_impacts i
    JOIN long_leave_records ll ON ll.company_id = i.company_id AND ll.id = i.long_leave_id
    JOIN employees e ON e.company_id = i.company_id AND e.id = i.employee_id
    ${employeeJoins}
    WHERE ${scope.sql}${month} AND ${period.sql}
    ORDER BY i.payroll_month DESC, e.employee_code`, [...scope.values, ...(filters.payroll_month ? [filters.payroll_month] : []), ...period.values], filters);
};

export const leaveDeductions = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const scope = employeeScope(context, filters);
  const period = periodWhere(filters, "l.start_date");
  return paginate(env, `SELECT ${employeeColumns},
      COALESCE(lt.leave_name, lt.leave_key, l.leave_type_id) AS leave_type,
      l.id AS leave_request_id,
      substr(l.start_date, 1, 7) AS payroll_month,
      CASE WHEN COALESCE(lt.is_paid, 1) = 0 THEN l.total_days ELSE 0 END AS unpaid_leave_days,
      CASE WHEN COALESCE(lt.is_paid, 1) = 1 THEN l.total_days ELSE 0 END AS paid_leave_days,
      l.total_days AS holiday_adjusted_duration,
      ${amount("COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = l.company_id AND pd.source_id = l.id), 0)", canViewSensitive)} AS deduction_amount,
      COALESCE(l.approval_status, l.status) AS approval_status,
      COALESCE((SELECT pr.status FROM payroll_runs pr WHERE pr.company_id = l.company_id AND pr.payroll_month = substr(l.start_date, 1, 7) LIMIT 1), 'not_started') AS payroll_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM leave_requests l
    JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
    ${employeeJoins}
    LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
    WHERE ${scope.sql} AND ${period.sql} AND l.affects_payroll = 1
    ORDER BY l.start_date DESC, e.employee_code`, [...scope.values, ...period.values], filters);
};

export const payslipStatus = (env: Env, context: AuthActor, filters: PayrollReportFilters) => {
  const base = payrollItemBase(context, filters);
  const status = filters.payslip_status ? " AND COALESCE(ps.status, 'missing') = ?" : "";
  return paginate(env, `SELECT ${employeeColumns},
      pr.payroll_month,
      pr.id AS payroll_run_id,
      CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END AS payslip_generated,
      ps.generated_at AS payslip_generated_at,
      ps.generated_by AS payslip_generated_by,
      COALESCE(ps.status, 'missing') AS payslip_status,
      CASE WHEN pr.status IN ('finalized', 'locked', 'paid') THEN 1 ELSE 0 END AS locked_finalized,
      CASE WHEN pr.status IN ('finalized', 'locked', 'paid') AND ps.id IS NULL THEN 1 ELSE 0 END AS missing_finalized_warning
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    LEFT JOIN payslips ps ON ps.company_id = pi.company_id AND ps.payroll_item_id = pi.id
    WHERE ${base.where}${status}
    ORDER BY pr.payroll_month DESC, e.employee_code`, [...base.values, ...(filters.payslip_status ? [filters.payslip_status] : [])], filters);
};

export const approvalFinalization = (env: Env, context: AuthActor, filters: PayrollReportFilters) => {
  const run = runFilters(filters, "pr");
  const scope = payrollRunEmployeeScope(context, filters, "pr");
  return paginate(env, `SELECT pr.payroll_month,
      pr.id AS payroll_run_id,
      COALESCE(ar.status, pr.status) AS approval_status,
      COALESCE((SELECT COUNT(*) FROM approval_steps s WHERE s.company_id = pr.company_id AND s.workflow_id = ar.workflow_id), 0) AS approval_steps,
      pr.approved_by,
      CASE WHEN COALESCE(ar.status, '') = 'rejected' THEN (SELECT aa.acted_by FROM approval_actions aa WHERE aa.company_id = pr.company_id AND aa.approval_request_id = ar.id AND aa.action = 'reject' ORDER BY aa.created_at DESC LIMIT 1) ELSE NULL END AS rejected_by,
      pr.finalized_by,
      pr.finalized_at AS finalized_date,
      pr.status AS locked_status,
      COALESCE((SELECT COUNT(*) FROM approval_requests pending WHERE pending.company_id = pr.company_id AND pending.entity_type = 'payroll_run' AND pending.entity_id = pr.id AND pending.status IN ('pending', 'in_progress')), 0) AS pending_approval_count
    FROM payroll_runs pr
    LEFT JOIN approval_requests ar ON ar.company_id = pr.company_id AND ar.id = pr.approval_request_id
    WHERE pr.company_id = ? AND ${run.sql} AND ${scope.sql}
    ORDER BY pr.payroll_month DESC`, [context.companyId, ...run.values, ...scope.values], filters);
};

const costReport = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean, grouping: "outlet" | "department") => {
  const base = payrollItemBase(context, filters);
  const groupId = grouping === "outlet" ? "e.primary_outlet_id" : "e.department_id";
  const groupName = grouping === "outlet" ? "o.name" : "d.name";
  return paginate(env, `SELECT '${grouping}' AS grouping,
      ${groupId} AS group_id,
      COALESCE(${groupName}, 'Unassigned') AS group_name,
      COUNT(DISTINCT pi.employee_id) AS employee_count,
      ${amount("SUM(pi.gross_amount)", canViewSensitive)} AS gross_salary,
      ${amount("SUM(COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND pe.earning_type IN ('allowance', 'recurring_allowance', 'cash_benefit')), 0))", canViewSensitive)} AS allowances_total,
      ${amount("SUM(pi.total_deductions_amount)", canViewSensitive)} AS total_deductions,
      ${amount("SUM(COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND (pe.earning_type LIKE '%overtime%' OR pe.source_type = 'overtime')), 0))", canViewSensitive)} AS overtime_total,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.deduction_type LIKE '%long_leave%' OR pd.source_type = 'long_leave')), 0))", canViewSensitive)} AS long_leave_deductions_total,
      ${amount("SUM(pi.net_amount)", canViewSensitive)} AS net_payable_salary,
      pr.payroll_month,
      pr.status AS payroll_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    WHERE ${base.where}
    GROUP BY pr.payroll_month, pr.status, ${groupId}, ${groupName}
    ORDER BY pr.payroll_month DESC, group_name`, base.values, filters);
};

export const outletCost = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) =>
  costReport(env, context, filters, canViewSensitive, "outlet");

export const departmentCost = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) =>
  costReport(env, context, filters, canViewSensitive, "department");

export const variance = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  const threshold = filters.variance_threshold ?? 0;
  return paginate(env, `SELECT ${employeeColumns},
      pr.payroll_month,
      ${amount("pi.gross_amount", canViewSensitive)} AS current_gross,
      ${amount("prev.gross_amount", canViewSensitive)} AS previous_gross,
      ${amount("pi.net_amount", canViewSensitive)} AS current_net,
      ${amount("prev.net_amount", canViewSensitive)} AS previous_net,
      ${amount("(pi.net_amount - COALESCE(prev.net_amount, 0))", canViewSensitive)} AS difference_amount,
      CASE WHEN COALESCE(prev.net_amount, 0) = 0 THEN NULL ELSE ROUND(((pi.net_amount - prev.net_amount) * 100.0) / prev.net_amount, 2) END AS difference_percent,
      CASE
        WHEN EXISTS (SELECT 1 FROM employee_salary_history h WHERE h.company_id = e.company_id AND h.employee_id = e.id AND substr(h.effective_from, 1, 7) = pr.payroll_month) THEN 'salary_change'
        WHEN EXISTS (SELECT 1 FROM long_leave_payroll_impacts lli WHERE lli.company_id = e.company_id AND lli.employee_id = e.id AND lli.payroll_month = pr.payroll_month) THEN 'long_leave'
        WHEN EXISTS (SELECT 1 FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND pd.source_type IN ('advance', 'salary_loan')) THEN 'advance_or_loan'
        WHEN EXISTS (SELECT 1 FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND (pe.earning_type LIKE '%overtime%' OR pe.source_type = 'overtime')) THEN 'overtime'
        ELSE 'manual_or_regular_change'
      END AS variance_reason,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    LEFT JOIN payroll_runs prev_run ON prev_run.company_id = pr.company_id AND prev_run.payroll_month = strftime('%Y-%m', date(pr.payroll_month || '-01', '-1 month'))
    LEFT JOIN payroll_items prev ON prev.company_id = pi.company_id AND prev.payroll_run_id = prev_run.id AND prev.employee_id = pi.employee_id
    WHERE ${base.where} AND ABS(pi.net_amount - COALESCE(prev.net_amount, 0)) >= ?
    ORDER BY ABS(pi.net_amount - COALESCE(prev.net_amount, 0)) DESC`, [...base.values, threshold], filters);
};

export const audit = (env: Env, context: AuthActor, filters: PayrollReportFilters) => {
  const period = periodWhere(filters, "al.created_at");
  const entity = filters.payroll_run_id ? " AND al.entity_id = ?" : "";
  const scope = auditEmployeeScope(context, filters);
  return paginate(env, `SELECT al.entity_id AS payroll_run_id,
      al.employee_id,
      al.action,
      al.actor_user_id AS actor,
      al.created_at AS timestamp,
      CASE WHEN al.old_value_json IS NOT NULL OR al.new_value_json IS NOT NULL THEN 'Values changed; details restricted to source record.' ELSE 'No value payload recorded.' END AS before_after_summary,
      substr(COALESCE(al.reason, ''), 1, 120) AS reason,
      COALESCE(al.entity_type, al.module) || ':' || COALESCE(al.entity_id, '') AS entity_reference
    FROM audit_logs al
    WHERE al.company_id = ?
      AND al.module IN ('payroll', 'payslips', 'salary', 'advances', 'salary_loans', 'long_leave')
      AND ${period.sql}${entity}
      AND ${scope.sql}
    ORDER BY al.created_at DESC`, [context.companyId, ...period.values, ...(filters.payroll_run_id ? [filters.payroll_run_id] : []), ...scope.values], filters);
};

export const financeSummary = (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  return paginate(env, `SELECT pr.payroll_month,
      'company' AS grouping,
      'Company payroll' AS group_name,
      ${amount("SUM(pi.gross_amount)", canViewSensitive)} AS gross_payroll,
      ${amount("SUM(pi.net_amount)", canViewSensitive)} AS net_payable,
      ${amount("SUM(pi.total_deductions_amount)", canViewSensitive)} AS deductions_total,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.source_type = 'advance' OR pd.deduction_type = 'advance')), 0))", canViewSensitive)} AS advances_recovered,
      ${amount("SUM(COALESCE((SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id AND (pd.source_type = 'salary_loan' OR pd.deduction_type IN ('salary_loan', 'loan'))), 0))", canViewSensitive)} AS loans_recovered,
      ${amount("SUM(COALESCE((SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id AND (pe.source_type = 'overtime' OR pe.earning_type LIKE '%overtime%')), 0))", canViewSensitive)} AS overtime_total,
      ${amount("SUM(pi.gross_amount)", canViewSensitive)} AS employer_cost,
      CASE WHEN pr.status IN ('paid') THEN 'paid' WHEN pr.status IN ('finalized', 'locked') THEN 'payment_pending' ELSE pr.status END AS payment_status,
      ${moneyRestrictedColumn(canViewSensitive)}
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    ${employeeJoins}
    WHERE ${base.where}
    GROUP BY pr.payroll_month, pr.status
    ORDER BY pr.payroll_month DESC`, base.values, filters);
};

export const summary = async (env: Env, context: AuthActor, filters: PayrollReportFilters, canViewSensitive: boolean) => {
  const base = payrollItemBase(context, filters);
  const row = await one<Record<string, number | null>>(env, `SELECT
      COUNT(DISTINCT pr.id) AS payroll_runs,
      COUNT(DISTINCT pi.employee_id) AS employees_in_payroll,
      ${amount("SUM(pi.gross_amount)", canViewSensitive)} AS gross_payroll,
      ${amount("SUM(pi.net_amount)", canViewSensitive)} AS net_payable,
      SUM(CASE WHEN pr.status IN ('draft', 'calculated', 'pending_approval') THEN 1 ELSE 0 END) AS open_runs,
      SUM(CASE WHEN ps.id IS NULL AND pr.status IN ('finalized', 'locked', 'paid') THEN 1 ELSE 0 END) AS finalized_missing_payslips
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.company_id = pi.company_id AND pr.id = pi.payroll_run_id
    JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
    LEFT JOIN payslips ps ON ps.company_id = pi.company_id AND ps.payroll_item_id = pi.id
    WHERE ${base.where}`, base.values);
  return row ?? {};
};
