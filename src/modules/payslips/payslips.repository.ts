import type { PayslipFilters } from "./payslips.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const findPayrollRun = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM payroll_runs WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
const itemScope = (outletIds?: string[]) => {
  if (!outletIds) return { sql: "", values: [] as unknown[] };
  if (outletIds.length === 0) return { sql: " AND 1 = 0", values: [] as unknown[] };
  return {
    sql: ` AND i.outlet_id IN (${outletIds.map(() => "?").join(", ")})`,
    values: outletIds as unknown[],
  };
};
export const listPayrollItemsWithoutPayslips = (env: Env, companyId: string, payrollRunId: string, outletIds?: string[]) => {
  const scope = itemScope(outletIds);
  return many<any>(
    env,
    `SELECT i.* FROM payroll_items i
     WHERE i.company_id = ? AND i.payroll_run_id = ?
       ${scope.sql}
       AND NOT EXISTS (SELECT 1 FROM payslips p WHERE p.payroll_item_id = i.id)`,
    [companyId, payrollRunId, ...scope.values],
  );
};
export const countExistingPayslipsForRun = async (env: Env, companyId: string, payrollRunId: string, outletIds?: string[]) => {
  const scope = itemScope(outletIds);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM payslips p
     JOIN payroll_items i ON i.id = p.payroll_item_id
     WHERE p.company_id = ? AND p.payroll_run_id = ? ${scope.sql}`,
    [companyId, payrollRunId, ...scope.values],
  );
  return row?.total ?? 0;
};
export const countPayrollItemsForRun = async (env: Env, companyId: string, payrollRunId: string, outletIds?: string[]) => {
  const scope = itemScope(outletIds);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM payroll_items i WHERE i.company_id = ? AND i.payroll_run_id = ? ${scope.sql}`,
    [companyId, payrollRunId, ...scope.values],
  );
  return row?.total ?? 0;
};
export const createPayslip = (env: Env, input: { id: string; companyId: string; payrollRunId: string; payrollItemId: string; employeeId: string; generatedBy: string }) =>
  run(
    env,
    `INSERT INTO payslips (
      id, company_id, payroll_run_id, payroll_item_id, employee_id,
      file_key, status, generated_by, generated_at, downloaded_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 'generated', ?, ?, NULL)`,
    [input.id, input.companyId, input.payrollRunId, input.payrollItemId, input.employeeId, input.generatedBy, new Date().toISOString()],
  );
const where = (companyId: string, filters: PayslipFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const clauses = ["p.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`i.outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (filters.payroll_run_id) { clauses.push("p.payroll_run_id = ?"); values.push(filters.payroll_run_id); }
  if (filters.payroll_month) { clauses.push("r.payroll_month = ?"); values.push(filters.payroll_month); }
  if (filters.employee_id) { clauses.push("p.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("i.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.status) { clauses.push("p.status = ?"); values.push(filters.status); }
  return { sql: clauses.join(" AND "), values };
};
export const listPayslips = (env: Env, companyId: string, filters: PayslipFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  return many<any>(
    env,
    `SELECT p.*, r.payroll_month, e.employee_code, e.full_name AS employee_name, i.outlet_id, o.name AS outlet_name
     FROM payslips p
     JOIN payroll_runs r ON r.id = p.payroll_run_id
     JOIN payroll_items i ON i.id = p.payroll_item_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN outlets o ON o.id = i.outlet_id
     WHERE ${built.sql}
     ORDER BY p.generated_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const countPayslips = async (env: Env, companyId: string, filters: PayslipFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM payslips p JOIN payroll_runs r ON r.id = p.payroll_run_id JOIN payroll_items i ON i.id = p.payroll_item_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};
export const findPayslip = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT p.*, r.payroll_month, e.employee_code, e.full_name AS employee_name, i.outlet_id
     FROM payslips p
     JOIN payroll_runs r ON r.id = p.payroll_run_id
     JOIN payroll_items i ON i.id = p.payroll_item_id
     JOIN employees e ON e.id = p.employee_id
     WHERE p.company_id = ? AND p.id = ? LIMIT 1`,
    [companyId, id],
  );
