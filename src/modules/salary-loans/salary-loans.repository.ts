import type { SalaryLoanFilters, SalaryLoanInput, SalaryLoanUpdateInput } from "./salary-loans.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; primary_outlet_id: string | null }>(
    env,
    "SELECT id, primary_outlet_id FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findLoan = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT l.*, e.primary_outlet_id AS outlet_id, e.employee_code, e.full_name AS employee_name
     FROM salary_loans l JOIN employees e ON e.id = l.employee_id
     WHERE l.company_id = ? AND l.id = ? LIMIT 1`,
    [companyId, id],
  );

const where = (companyId: string, filters: SalaryLoanFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const clauses = ["l.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`e.primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.employee_id) { clauses.push("l.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.status) { clauses.push("l.status = ?"); values.push(filters.status); }
  return { sql: clauses.join(" AND "), values };
};
export const listLoans = (env: Env, companyId: string, filters: SalaryLoanFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  return many<any>(
    env,
    `SELECT l.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name
     FROM salary_loans l JOIN employees e ON e.id = l.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const countLoans = async (env: Env, companyId: string, filters: SalaryLoanFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM salary_loans l JOIN employees e ON e.id = l.employee_id WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const createLoan = (env: Env, id: string, companyId: string, input: SalaryLoanInput, userId: string) =>
  run(
    env,
    `INSERT INTO salary_loans (
      id, company_id, employee_id, loan_amount, installment_amount,
      outstanding_amount, start_month, status, approval_request_id,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`,
    [id, companyId, input.employee_id, input.loan_amount, input.installment_amount, input.loan_amount, input.start_month, userId, new Date().toISOString(), new Date().toISOString()],
  );
export const updateLoan = (env: Env, companyId: string, id: string, input: SalaryLoanUpdateInput) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["employee_id", "loan_amount", "installment_amount", "start_month"] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key]);
    }
  }
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE salary_loans SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};
export const updateLoanStatus = (env: Env, companyId: string, id: string, status: string, outstandingAmount?: number) =>
  run(
    env,
    `UPDATE salary_loans SET status = ?, outstanding_amount = COALESCE(?, outstanding_amount), updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [status, outstandingAmount ?? null, new Date().toISOString(), companyId, id],
  );

const addMonths = (month: string, offset: number) => {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const createInstallments = async (env: Env, companyId: string, loan: any) => {
  let remaining = loan.loan_amount;
  let offset = 0;
  while (remaining > 0) {
    const amount = Math.min(remaining, loan.installment_amount);
    await run(
      env,
      `INSERT INTO salary_loan_installments (
        id, company_id, salary_loan_id, employee_id, payroll_month,
        amount, status, payroll_item_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?, ?)`,
      [crypto.randomUUID(), companyId, loan.id, loan.employee_id, addMonths(loan.start_month, offset), amount, new Date().toISOString(), new Date().toISOString()],
    );
    remaining -= amount;
    offset += 1;
  }
};
export const listInstallments = (env: Env, companyId: string, loanId: string) =>
  many<any>(
    env,
    "SELECT * FROM salary_loan_installments WHERE company_id = ? AND salary_loan_id = ? ORDER BY payroll_month ASC",
    [companyId, loanId],
  );
export const countInstallments = async (env: Env, companyId: string, loanId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM salary_loan_installments WHERE company_id = ? AND salary_loan_id = ?",
    [companyId, loanId],
  );
  return row?.total ?? 0;
};
export const listMutableInstallmentMonths = async (env: Env, companyId: string, loanId: string) => {
  const rows = await many<{ payroll_month: string }>(
    env,
    "SELECT DISTINCT payroll_month FROM salary_loan_installments WHERE company_id = ? AND salary_loan_id = ? AND status IN ('scheduled', 'due', 'paused')",
    [companyId, loanId],
  );
  return rows.map((row) => row.payroll_month);
};
export const listLockedPayrollMonths = async (env: Env, companyId: string, months: string[]) => {
  if (months.length === 0) return [];
  const rows = await many<{ payroll_month: string }>(
    env,
    `SELECT payroll_month FROM payroll_runs
     WHERE company_id = ? AND payroll_month IN (${months.map(() => "?").join(", ")})
       AND status IN ('locked', 'paid')`,
    [companyId, ...months],
  );
  return rows.map((row) => row.payroll_month);
};
export const pauseFutureInstallments = (env: Env, companyId: string, loanId: string) =>
  run(env, "UPDATE salary_loan_installments SET status = 'paused', updated_at = ? WHERE company_id = ? AND salary_loan_id = ? AND status IN ('scheduled', 'due')", [new Date().toISOString(), companyId, loanId]);
export const settleFutureInstallments = (env: Env, companyId: string, loanId: string) =>
  run(env, "UPDATE salary_loan_installments SET status = 'settled', updated_at = ? WHERE company_id = ? AND salary_loan_id = ? AND status IN ('scheduled', 'due', 'paused')", [new Date().toISOString(), companyId, loanId]);
