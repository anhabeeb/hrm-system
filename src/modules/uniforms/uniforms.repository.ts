import type { UniformFilters, UniformIssueInput, UniformOutletScope } from "./uniforms.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<any>(
    env,
    "SELECT id, full_name, primary_outlet_id, employment_status, deleted_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findOutlet = (env: Env, companyId: string, outletId: string) =>
  one<{ id: string; name: string; status: string }>(
    env,
    "SELECT id, name, status FROM outlets WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, outletId],
  );

const buildWhere = (companyId: string, filters: UniformFilters, scope: UniformOutletScope) => {
  const clauses = ["u.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!scope.isSuperAdmin) {
    if (scope.outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`u.outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
      values.push(...scope.outletIds);
    }
  }
  if (filters.employee_id) { clauses.push("u.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("u.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.uniform_type) { clauses.push("u.uniform_type = ?"); values.push(filters.uniform_type); }
  if (filters.status) { clauses.push("u.status = ?"); values.push(filters.status); }
  if (filters.date_from) { clauses.push("u.issued_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("u.issued_date <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const countUniforms = async (env: Env, companyId: string, filters: UniformFilters, scope: UniformOutletScope) => {
  const built = buildWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM uniform_issues u JOIN employees e ON e.id = u.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listUniforms = (env: Env, companyId: string, filters: UniformFilters, scope: UniformOutletScope) => {
  const built = buildWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT u.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name
     FROM uniform_issues u
     JOIN employees e ON e.id = u.employee_id
     LEFT JOIN outlets o ON o.id = u.outlet_id
     WHERE ${built.sql}
     ORDER BY u.issued_date DESC, u.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findUniformById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT u.id, u.company_id, u.employee_id, e.employee_code, e.full_name AS employee_name,
      u.outlet_id, o.name AS outlet_name, e.primary_outlet_id AS employee_outlet_id,
      u.uniform_type, u.quantity, u.issued_date, u.returned_date, u.status,
      u.created_by, u.created_at, u.updated_at
     FROM uniform_issues u JOIN employees e ON e.id = u.employee_id
     LEFT JOIN outlets o ON o.id = u.outlet_id
     WHERE u.company_id = ? AND u.id = ? LIMIT 1`,
    [companyId, id],
  );

export const createUniformIssue = (env: Env, id: string, companyId: string, input: UniformIssueInput, outletId: string | null, actorUserId: string) =>
  run(
    env,
    `INSERT INTO uniform_issues (
      id, company_id, employee_id, outlet_id, uniform_type, quantity,
      issued_date, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)`,
    [id, companyId, input.employee_id, outletId, input.uniform_type, input.quantity, input.issued_date, actorUserId, new Date().toISOString(), new Date().toISOString()],
  );

export const returnUniform = (env: Env, companyId: string, id: string, returnedDate: string) =>
  run(
    env,
    "UPDATE uniform_issues SET returned_date = ?, status = 'returned', updated_at = ? WHERE company_id = ? AND id = ?",
    [returnedDate, new Date().toISOString(), companyId, id],
  );
