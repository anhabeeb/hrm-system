import type { AdvanceFilters, AdvanceInput, AdvanceUpdateInput } from "./advances.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; primary_outlet_id: string | null; full_name: string }>(
    env,
    "SELECT id, primary_outlet_id, full_name FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findAdvance = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT a.*, e.primary_outlet_id AS outlet_id, e.employee_code, e.full_name AS employee_name
     FROM advance_payments a JOIN employees e ON e.id = a.employee_id
     WHERE a.company_id = ? AND a.id = ? LIMIT 1`,
    [companyId, id],
  );

const where = (companyId: string, filters: AdvanceFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const clauses = ["a.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`e.primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.employee_id) { clauses.push("a.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.status) { clauses.push("a.status = ?"); values.push(filters.status); }
  if (filters.deduction_month) { clauses.push("a.deduction_month = ?"); values.push(filters.deduction_month); }
  if (filters.date_from) { clauses.push("a.paid_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("a.paid_date <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listAdvances = (env: Env, companyId: string, filters: AdvanceFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  return many<any>(
    env,
    `SELECT a.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name
     FROM advance_payments a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countAdvances = async (env: Env, companyId: string, filters: AdvanceFilters, outletIds: string[], isSuperAdmin: boolean) => {
  const built = where(companyId, filters, outletIds, isSuperAdmin);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM advance_payments a JOIN employees e ON e.id = a.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const createAdvance = (env: Env, id: string, companyId: string, input: AdvanceInput, userId: string) =>
  run(
    env,
    `INSERT INTO advance_payments (
      id, company_id, employee_id, amount, paid_date, deduction_month,
      status, approval_request_id, reason, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)`,
    [id, companyId, input.employee_id, input.amount, input.paid_date, input.deduction_month, input.reason, userId, new Date().toISOString(), new Date().toISOString()],
  );

export const updateAdvance = (env: Env, companyId: string, id: string, input: AdvanceUpdateInput) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["employee_id", "amount", "paid_date", "deduction_month", "reason"] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key]);
    }
  }
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE advance_payments SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const updateStatus = (env: Env, companyId: string, id: string, status: string) =>
  run(
    env,
    "UPDATE advance_payments SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, new Date().toISOString(), companyId, id],
  );
