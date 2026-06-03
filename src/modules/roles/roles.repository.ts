import type { RoleListFilters, RolePermission, RoleRecord } from "./roles.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const buildWhere = (companyId: string, filters: RoleListFilters) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(lower(r.role_name) LIKE lower(?) OR lower(r.role_key) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status === "active") clauses.push("r.is_active = 1");
  if (filters.status === "inactive" || filters.status === "disabled") clauses.push("r.is_active = 0");
  return { sql: clauses.join(" AND "), values };
};

export const countRoles = async (env: Env, companyId: string, filters: RoleListFilters) => {
  const built = buildWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM roles r WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listRoles = (env: Env, companyId: string, filters: RoleListFilters) => {
  const built = buildWhere(companyId, filters);
  return many<RoleRecord>(
    env,
    `SELECT r.id, r.company_id, r.role_key, r.role_name, r.description,
            r.is_system_role, r.is_active, r.created_at, r.updated_at,
            COUNT(DISTINCT u.id) AS users_count
       FROM roles r
       LEFT JOIN user_roles ur ON ur.company_id = r.company_id AND ur.role_id = r.id
       LEFT JOIN users u ON u.company_id = ur.company_id AND u.id = ur.user_id AND u.deleted_at IS NULL
      WHERE ${built.sql}
      GROUP BY r.id
      ORDER BY r.is_system_role DESC, r.role_name ASC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findRoleById = (env: Env, companyId: string, id: string) =>
  one<RoleRecord>(
    env,
    `SELECT id, company_id, role_key, role_name, description, is_system_role,
            is_active, created_at, updated_at
       FROM roles
      WHERE company_id = ? AND id = ?
      LIMIT 1`,
    [companyId, id],
  );

export const getRolePermissions = (env: Env, companyId: string, roleId: string) =>
  many<RolePermission>(
    env,
    `SELECT p.id, p.permission_key, p.module, p.action, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.permission_key = rp.permission_key
      WHERE rp.company_id = ? AND rp.role_id = ?
      ORDER BY p.module ASC, p.action ASC, p.permission_key ASC`,
    [companyId, roleId],
  );
