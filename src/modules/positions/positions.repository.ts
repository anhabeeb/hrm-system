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
  if (filters.level) {
    clauses.push("level = ?");
    values.push(filters.level);
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
    `SELECT p.*, d.name AS department_name, r.role_name AS default_role_name
       FROM positions p
       LEFT JOIN departments d ON d.company_id = p.company_id AND d.id = p.department_id
       LEFT JOIN roles r ON r.company_id = p.company_id AND r.id = p.default_role_id
      WHERE ${built.sql.replaceAll("company_id", "p.company_id").replaceAll("deleted_at", "p.deleted_at").replaceAll("department_id", "p.department_id").replaceAll("status", "p.status").replaceAll("title", "p.title").replaceAll("code", "p.code").replaceAll("level", "p.level")}
      ORDER BY p.${filters.sort_by} ${filters.sort_direction.toUpperCase()} LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const findPositionById = (env: Env, companyId: string, id: string) =>
  one<PositionRecord>(
    env,
    `SELECT p.*, d.name AS department_name, r.role_name AS default_role_name
       FROM positions p
       LEFT JOIN departments d ON d.company_id = p.company_id AND d.id = p.department_id
       LEFT JOIN roles r ON r.company_id = p.company_id AND r.id = p.default_role_id
      WHERE p.company_id = ? AND p.id = ? LIMIT 1`,
    [companyId, id],
  );
export const findPositionByCode = (env: Env, companyId: string, code: string) =>
  one<PositionRecord>(env, "SELECT * FROM positions WHERE company_id = ? AND code = ? LIMIT 1", [companyId, code]);
export const findPositionByTitleInDepartment = (env: Env, companyId: string, departmentId: string, title: string) =>
  one<PositionRecord>(
    env,
    "SELECT * FROM positions WHERE company_id = ? AND department_id = ? AND lower(title) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [companyId, departmentId, title],
  );
export const findDepartment = (env: Env, companyId: string, id: string) =>
  one<{ id: string; status: string; is_active?: number; archived_at?: string | null }>(
    env,
    "SELECT id, status, is_active, archived_at FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );
export const findRole = (env: Env, companyId: string, id: string) =>
  one<{ id: string; role_name: string; role_key: string }>(
    env,
    "SELECT id, role_name, role_key FROM roles WHERE company_id = ? AND id = ? AND is_active = 1 LIMIT 1",
    [companyId, id],
  );
export const countAssignedEmployees = async (env: Env, companyId: string, id: string) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM employees WHERE company_id = ? AND position_id = ? AND deleted_at IS NULL", [companyId, id]);
  return row?.total ?? 0;
};
export const createPosition = (env: Env, id: string, companyId: string, input: PositionWriteInput) =>
  run(env, `INSERT INTO positions (
    id, company_id, department_id, title, code, description, level,
    default_role_id, can_manage_lower_levels, can_act_as_department_approver,
    default_salary_amount, status, is_active, created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id,
    companyId,
    input.department_id,
    input.title,
    input.code ?? null,
    input.description ?? null,
    input.level ?? 1,
    input.default_role_id ?? null,
    input.can_manage_lower_levels ? 1 : 0,
    input.can_act_as_department_approver ? 1 : 0,
    input.default_salary_amount ?? null,
    input.status ?? "active",
    (input.status ?? "active") === "active" ? 1 : 0,
    new Date().toISOString(),
    new Date().toISOString(),
    input.created_by ?? null,
    input.updated_by ?? null,
  ]);
export const updatePosition = (env: Env, companyId: string, id: string, input: PositionWriteInput & { deleted_at?: string | null }) =>
  run(env, `UPDATE positions
       SET department_id = ?, title = ?, code = ?, description = ?, level = ?,
           default_role_id = ?, can_manage_lower_levels = ?, can_act_as_department_approver = ?,
           default_salary_amount = ?, status = ?, is_active = ?, updated_at = ?,
           updated_by = ?, deleted_at = ?, archived_at = ?
     WHERE company_id = ? AND id = ?`, [
    input.department_id,
    input.title,
    input.code ?? null,
    input.description ?? null,
    input.level ?? 1,
    input.default_role_id ?? null,
    input.can_manage_lower_levels ? 1 : 0,
    input.can_act_as_department_approver ? 1 : 0,
    input.default_salary_amount ?? null,
    input.status ?? "active",
    (input.status ?? "active") === "active" ? 1 : 0,
    new Date().toISOString(),
    input.updated_by ?? null,
    input.deleted_at ?? null,
    input.archived_at ?? null,
    companyId,
    id,
  ]);
