import type { PositionFilters, PositionRecord, PositionWriteInput } from "./positions.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const where = (companyId: string, filters: PositionFilters) => {
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(lower(title) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.department_id) {
    clauses.push("department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  return { sql: clauses.join(" AND "), values };
};
export const countPositions = async (env: Env, companyId: string, filters: PositionFilters) => {
  const built = where(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM positions WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const listPositions = (env: Env, companyId: string, filters: PositionFilters) => {
  const built = where(companyId, filters);
  return many<PositionRecord>(
    env,
    `SELECT * FROM positions WHERE ${built.sql} ORDER BY ${filters.sort_by} ${filters.sort_direction.toUpperCase()} LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const findPositionById = (env: Env, companyId: string, id: string) =>
  one<PositionRecord>(env, "SELECT * FROM positions WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const findPositionByCode = (env: Env, companyId: string, code: string) =>
  one<PositionRecord>(env, "SELECT * FROM positions WHERE company_id = ? AND code = ? LIMIT 1", [companyId, code]);
export const findDepartment = (env: Env, companyId: string, id: string) =>
  one<{ id: string; status: string }>(env, "SELECT id, status FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1", [companyId, id]);
export const countAssignedEmployees = async (env: Env, companyId: string, id: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM employees WHERE company_id = ? AND position_id = ? AND deleted_at IS NULL", [companyId, id]);
  return row?.total ?? 0;
};
export const createPosition = (env: Env, id: string, companyId: string, input: PositionWriteInput) =>
  run(env, "INSERT INTO positions (id, company_id, department_id, title, code, default_salary_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    id,
    companyId,
    input.department_id ?? null,
    input.title,
    input.code ?? null,
    input.default_salary_amount ?? null,
    input.status ?? "active",
    new Date().toISOString(),
    new Date().toISOString(),
  ]);
export const updatePosition = (env: Env, companyId: string, id: string, input: PositionWriteInput & { deleted_at?: string | null }) =>
  run(env, "UPDATE positions SET department_id = ?, title = ?, code = ?, default_salary_amount = ?, status = ?, updated_at = ?, deleted_at = ? WHERE company_id = ? AND id = ?", [
    input.department_id ?? null,
    input.title,
    input.code ?? null,
    input.default_salary_amount ?? null,
    input.status ?? "active",
    new Date().toISOString(),
    input.deleted_at ?? null,
    companyId,
    id,
  ]);
