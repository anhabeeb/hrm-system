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
    `SELECT d.*,
            h.full_name AS head_employee_name,
            COUNT(DISTINCT e.id) AS employee_count,
            COUNT(DISTINCT p.id) AS position_count
       FROM departments d
       LEFT JOIN employees h ON h.company_id = d.company_id AND h.id = d.head_employee_id AND h.deleted_at IS NULL
       LEFT JOIN employees e ON e.company_id = d.company_id AND e.department_id = d.id AND e.deleted_at IS NULL
       LEFT JOIN positions p ON p.company_id = d.company_id AND p.department_id = d.id AND p.deleted_at IS NULL
      WHERE ${built.sql.replaceAll("company_id", "d.company_id").replaceAll("deleted_at", "d.deleted_at").replaceAll("status", "d.status").replaceAll("name", "d.name").replaceAll("code", "d.code")}
      GROUP BY d.id
      ORDER BY d.${filters.sort_by} ${filters.sort_direction.toUpperCase()} LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const findDepartmentById = (env: Env, companyId: string, id: string) =>
  one<DepartmentRecord>(
    env,
    `SELECT d.*, h.full_name AS head_employee_name,
            (SELECT COUNT(*) FROM employees e WHERE e.company_id = d.company_id AND e.department_id = d.id AND e.deleted_at IS NULL) AS employee_count,
            (SELECT COUNT(*) FROM positions p WHERE p.company_id = d.company_id AND p.department_id = d.id AND p.deleted_at IS NULL) AS position_count
       FROM departments d
       LEFT JOIN employees h ON h.company_id = d.company_id AND h.id = d.head_employee_id AND h.deleted_at IS NULL
      WHERE d.company_id = ? AND d.id = ? LIMIT 1`,
    [companyId, id],
  );
export const findDepartmentByCode = (env: Env, companyId: string, code: string) =>
  one<DepartmentRecord>(env, "SELECT * FROM departments WHERE company_id = ? AND code = ? LIMIT 1", [companyId, code]);
export const findDepartmentByName = (env: Env, companyId: string, name: string) =>
  one<DepartmentRecord>(env, "SELECT * FROM departments WHERE company_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1", [companyId, name]);
export const findHeadEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string }>(env, "SELECT id FROM employees WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1", [companyId, employeeId]);
export const countAssignedEmployees = async (env: Env, companyId: string, id: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM employees WHERE company_id = ? AND department_id = ? AND deleted_at IS NULL", [companyId, id]);
  return row?.total ?? 0;
};
export const countAssignedPositions = async (env: Env, companyId: string, id: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM positions WHERE company_id = ? AND department_id = ? AND deleted_at IS NULL", [companyId, id]);
  return row?.total ?? 0;
};
export const createDepartment = (env: Env, id: string, companyId: string, input: DepartmentWriteInput) =>
  run(env, `INSERT INTO departments (
    id, company_id, name, code, description, head_employee_id,
    day_to_day_management_min_level, status, is_active, created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id,
    companyId,
    input.name,
    input.code ?? null,
    input.description ?? null,
    input.head_employee_id ?? null,
    input.day_to_day_management_min_level ?? 3,
    input.status ?? "active",
    (input.status ?? "active") === "active" ? 1 : 0,
    new Date().toISOString(),
    new Date().toISOString(),
    input.created_by ?? null,
    input.updated_by ?? null,
  ]);
export const updateDepartment = (env: Env, companyId: string, id: string, input: DepartmentWriteInput & { deleted_at?: string | null }) =>
  run(env, `UPDATE departments
       SET name = ?, code = ?, description = ?, head_employee_id = ?,
           day_to_day_management_min_level = ?, status = ?, is_active = ?,
           updated_at = ?, updated_by = ?, deleted_at = ?, archived_at = ?
     WHERE company_id = ? AND id = ?`, [
    input.name,
    input.code ?? null,
    input.description ?? null,
    input.head_employee_id ?? null,
    input.day_to_day_management_min_level ?? 3,
    input.status ?? "active",
    (input.status ?? "active") === "active" ? 1 : 0,
    new Date().toISOString(),
    input.updated_by ?? null,
    input.deleted_at ?? null,
    input.archived_at ?? null,
    companyId,
    id,
  ]);
