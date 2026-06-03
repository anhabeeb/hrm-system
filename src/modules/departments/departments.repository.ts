import type { DepartmentFilters, DepartmentRecord, DepartmentWriteInput } from "./departments.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const where = (companyId: string, filters: DepartmentFilters) => {
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(lower(name) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  return { sql: clauses.join(" AND "), values };
};

export const countDepartments = async (env: Env, companyId: string, filters: DepartmentFilters) => {
  const built = where(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM departments WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const listDepartments = (env: Env, companyId: string, filters: DepartmentFilters) => {
  const built = where(companyId, filters);
  return many<DepartmentRecord>(
    env,
    `SELECT * FROM departments WHERE ${built.sql} ORDER BY ${filters.sort_by} ${filters.sort_direction.toUpperCase()} LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const findDepartmentById = (env: Env, companyId: string, id: string) =>
  one<DepartmentRecord>(env, "SELECT * FROM departments WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const findDepartmentByCode = (env: Env, companyId: string, code: string) =>
  one<DepartmentRecord>(env, "SELECT * FROM departments WHERE company_id = ? AND code = ? LIMIT 1", [companyId, code]);
export const countAssignedEmployees = async (env: Env, companyId: string, id: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM employees WHERE company_id = ? AND department_id = ? AND deleted_at IS NULL", [companyId, id]);
  return row?.total ?? 0;
};
export const createDepartment = (env: Env, id: string, companyId: string, input: DepartmentWriteInput) =>
  run(env, "INSERT INTO departments (id, company_id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    companyId,
    input.name,
    input.code ?? null,
    input.status ?? "active",
    new Date().toISOString(),
    new Date().toISOString(),
  ]);
export const updateDepartment = (env: Env, companyId: string, id: string, input: DepartmentWriteInput & { deleted_at?: string | null }) =>
  run(env, "UPDATE departments SET name = ?, code = ?, status = ?, updated_at = ?, deleted_at = ? WHERE company_id = ? AND id = ?", [
    input.name,
    input.code ?? null,
    input.status ?? "active",
    new Date().toISOString(),
    input.deleted_at ?? null,
    companyId,
    id,
  ]);
