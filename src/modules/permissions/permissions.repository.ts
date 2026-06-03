import type {
  EmployeeOutletRecord,
  PermissionRecord,
  PermissionOverrideRecord,
  RoleRecord,
} from "./permissions.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const queryMany = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const queryOne = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> => bind(env.DB.prepare(sql), values).first<T>();

export const getUserRoles = (
  env: Env,
  companyId: string,
  userId: string,
): Promise<RoleRecord[]> =>
  queryMany<RoleRecord>(
    env,
    `SELECT r.id, r.role_key, r.role_name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.company_id = ? AND ur.user_id = ? AND r.is_active = 1`,
    [companyId, userId],
  );

export const getRolePermissions = (
  env: Env,
  companyId: string,
  roleIds: string[],
): Promise<string[]> => {
  if (roleIds.length === 0) {
    return Promise.resolve([]);
  }

  const placeholders = roleIds.map(() => "?").join(", ");

  return queryMany<{ permission_key: string }>(
    env,
    `SELECT DISTINCT permission_key
     FROM role_permissions
     WHERE company_id = ? AND role_id IN (${placeholders})`,
    [companyId, ...roleIds],
  ).then((rows) => rows.map((row) => row.permission_key));
};

export const getUserPermissionOverrides = (
  env: Env,
  companyId: string,
  userId: string,
): Promise<PermissionOverrideRecord[]> =>
  queryMany<PermissionOverrideRecord>(
    env,
    `SELECT permission_key, is_allowed
     FROM user_permission_overrides
     WHERE company_id = ? AND user_id = ?`,
    [companyId, userId],
  );

export const getUserOutletIds = (
  env: Env,
  companyId: string,
  userId: string,
): Promise<string[]> =>
  queryMany<{ outlet_id: string }>(
    env,
    `SELECT outlet_id
     FROM user_outlets
     WHERE company_id = ?
       AND user_id = ?
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at > ?)`,
    [companyId, userId, new Date().toISOString(), new Date().toISOString()],
  ).then((rows) => rows.map((row) => row.outlet_id));

export const findEmployeeOutlet = (
  env: Env,
  companyId: string,
  employeeId: string,
): Promise<EmployeeOutletRecord | null> =>
  queryOne<EmployeeOutletRecord>(
    env,
    "SELECT id, primary_outlet_id FROM employees WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, employeeId],
  );

export const listPermissions = (env: Env): Promise<PermissionRecord[]> =>
  queryMany<PermissionRecord>(
    env,
    `SELECT id, permission_key, module, action, description
       FROM permissions
      ORDER BY module ASC, action ASC, permission_key ASC`,
  );
