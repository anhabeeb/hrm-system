import type { UserListFilters, UserRecord } from "./users.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();

const buildWhere = (companyId: string, filters: UserListFilters) => {
  const clauses = ["u.company_id = ?", "u.deleted_at IS NULL"];
  const values: unknown[] = [companyId];

  if (filters.search) {
    clauses.push("(lower(u.full_name) LIKE lower(?) OR lower(COALESCE(u.email, '')) LIKE lower(?) OR lower(COALESCE(u.username, '')) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    clauses.push("u.status = ?");
    values.push(filters.status);
  }
  if (filters.role_id) {
    clauses.push("EXISTS (SELECT 1 FROM user_roles ur_filter WHERE ur_filter.user_id = u.id AND ur_filter.company_id = u.company_id AND ur_filter.role_id = ?)");
    values.push(filters.role_id);
  }
  if (filters.outlet_id) {
    clauses.push("EXISTS (SELECT 1 FROM user_outlets uo_filter WHERE uo_filter.user_id = u.id AND uo_filter.company_id = u.company_id AND uo_filter.outlet_id = ? AND (uo_filter.ends_at IS NULL OR uo_filter.ends_at > ?))");
    values.push(filters.outlet_id, new Date().toISOString());
  }

  return { sql: clauses.join(" AND "), values };
};

export const countUsers = async (env: Env, companyId: string, filters: UserListFilters): Promise<number> => {
  const built = buildWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM users u WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listUsers = (env: Env, companyId: string, filters: UserListFilters): Promise<UserRecord[]> => {
  const built = buildWhere(companyId, filters);
  return many<UserRecord>(
    env,
    `SELECT u.id, u.company_id, u.employee_id, u.username, u.full_name, u.email, u.phone,
            u.password_updated_at, u.password_reset_required, u.failed_login_attempts,
            u.locked_until, u.last_password_reset_at, u.two_factor_enabled, u.status,
            u.last_login_at, u.created_at, u.updated_at, u.deleted_at
       FROM users u
      WHERE ${built.sql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findUserById = (env: Env, companyId: string, id: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    `SELECT id, company_id, employee_id, username, full_name, email, phone,
            password_updated_at, password_reset_required, failed_login_attempts,
            locked_until, last_password_reset_at, two_factor_enabled, status,
            last_login_at, created_at, updated_at, deleted_at
       FROM users
      WHERE company_id = ? AND id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [companyId, id],
  );

export const findUserByEmail = (env: Env, companyId: string, email: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    "SELECT * FROM users WHERE company_id = ? AND lower(email) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [companyId, email],
  );

export const findUserByEmailGlobally = (env: Env, email: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    "SELECT * FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [email],
  );

export const findUserByUsername = (env: Env, companyId: string, username: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    "SELECT * FROM users WHERE company_id = ? AND lower(username) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [companyId, username],
  );

export const findUserByUsernameGlobally = (env: Env, username: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    "SELECT * FROM users WHERE lower(username) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [username],
  );

export const findUserByEmployeeId = (env: Env, companyId: string, employeeId: string): Promise<UserRecord | null> =>
  one<UserRecord>(
    env,
    "SELECT * FROM users WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, employeeId],
  );

export const findEmployeeSummary = (
  env: Env,
  companyId: string,
  employeeId: string,
): Promise<{ id: string; employee_code: string; full_name: string; primary_outlet_id: string | null; deleted_at: string | null; employment_status: string } | null> =>
  one(
    env,
    `SELECT id, employee_code, full_name, primary_outlet_id, deleted_at, employment_status
       FROM employees
      WHERE company_id = ? AND id = ?
      LIMIT 1`,
    [companyId, employeeId],
  );

export const getUserEmployeeLinks = (env: Env, companyId: string, userIds: string[]) => {
  if (userIds.length === 0) return Promise.resolve([]);
  const placeholders = userIds.map(() => "?").join(", ");
  return many<{ user_id: string; employee_id: string; employee_code: string; employee_name: string }>(
    env,
    `SELECT u.id AS user_id, e.id AS employee_id, e.employee_code, e.full_name AS employee_name
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id AND e.deleted_at IS NULL
      WHERE u.company_id = ? AND u.id IN (${placeholders})`,
    [companyId, ...userIds],
  );
};

export const createUser = (env: Env, input: { id: string; companyId: string; fullName: string; username?: string | null; email: string; employeeId?: string | null; status: string }) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO users (
      id, company_id, employee_id, username, full_name, email, phone, password_hash,
      password_algo, password_updated_at, password_reset_required,
      failed_login_attempts, locked_until, last_password_reset_at,
      two_factor_enabled, status, last_login_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'pbkdf2_sha256', NULL, 1, 0, NULL, NULL, 0, ?, NULL, ?, ?, NULL)`,
    [input.id, input.companyId, input.employeeId ?? null, input.username ?? null, input.fullName, input.email, input.status, now, now],
  );
};

export const createEmployeeLoginUser = async (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    fullName: string;
    username: string;
    email: string | null;
    passwordHash: string;
    passwordAlgo: string;
    forcePasswordChange: boolean;
    status: string;
    roleId: string;
    outletIds: string[];
  },
) => {
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO users (
        id, company_id, employee_id, username, full_name, email, phone, password_hash,
        password_algo, password_updated_at, password_reset_required,
        failed_login_attempts, locked_until, last_password_reset_at,
        two_factor_enabled, status, last_login_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, NULL, ?, ?, NULL)`,
    ).bind(
      input.id,
      input.companyId,
      input.employeeId,
      input.username,
      input.fullName,
      input.email,
      input.passwordHash,
      input.passwordAlgo,
      now,
      input.forcePasswordChange ? 1 : 0,
      0,
      input.status,
      now,
      now,
    ),
    env.DB.prepare("INSERT INTO user_roles (id, company_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), input.companyId, input.id, input.roleId, now),
    ...input.outletIds.map((outletId) =>
      env.DB.prepare("INSERT INTO user_outlets (id, company_id, user_id, outlet_id, access_level, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, 'view_only', NULL, NULL, ?)")
        .bind(crypto.randomUUID(), input.companyId, input.id, outletId, now),
    ),
  ];
  await env.DB.batch(statements);
};

export const updateUser = (
  env: Env,
  companyId: string,
  id: string,
  input: { full_name: string; email: string | null; status: string },
) =>
  run(
    env,
    "UPDATE users SET full_name = ?, email = ?, status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [input.full_name, input.email, input.status, new Date().toISOString(), companyId, id],
  );

export const updateUserIdentity = (
  env: Env,
  companyId: string,
  id: string,
  input: { full_name: string; username: string | null; email: string | null; employee_id: string | null; status: string },
) =>
  run(
    env,
    "UPDATE users SET full_name = ?, username = ?, email = ?, employee_id = ?, status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [input.full_name, input.username, input.email, input.employee_id, input.status, new Date().toISOString(), companyId, id],
  );

export const setPasswordResetRequired = (env: Env, companyId: string, id: string) =>
  run(
    env,
    "UPDATE users SET password_reset_required = 1, last_password_reset_at = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), new Date().toISOString(), companyId, id],
  );

export const revokeUserSessions = (env: Env, companyId: string, userId: string, exceptSessionId?: string) => {
  if (exceptSessionId) {
    return run(
      env,
      "UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND id <> ? AND revoked_at IS NULL",
      [new Date().toISOString(), companyId, userId, exceptSessionId],
    );
  }
  return run(
    env,
    "UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL",
    [new Date().toISOString(), companyId, userId],
  );
};

export const getUserRoles = (env: Env, companyId: string, userIds: string[]) => {
  if (userIds.length === 0) return Promise.resolve([]);
  const placeholders = userIds.map(() => "?").join(", ");
  return many<{ user_id: string; role_id: string; role_name: string; role_key: string }>(
    env,
    `SELECT ur.user_id, r.id AS role_id, r.role_name, r.role_key
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.company_id = ur.company_id
      WHERE ur.company_id = ? AND ur.user_id IN (${placeholders})
      ORDER BY r.role_name`,
    [companyId, ...userIds],
  );
};

export const getUserOutlets = (env: Env, companyId: string, userIds: string[]) => {
  if (userIds.length === 0) return Promise.resolve([]);
  const placeholders = userIds.map(() => "?").join(", ");
  return many<{ user_id: string; outlet_id: string; outlet_name?: string | null }>(
    env,
    `SELECT uo.user_id, uo.outlet_id, o.name AS outlet_name
       FROM user_outlets uo
       LEFT JOIN outlets o ON o.company_id = uo.company_id AND o.id = uo.outlet_id AND o.deleted_at IS NULL
      WHERE uo.company_id = ? AND uo.user_id IN (${placeholders})
        AND (uo.ends_at IS NULL OR uo.ends_at > ?)
      ORDER BY uo.outlet_id`,
    [companyId, ...userIds, new Date().toISOString()],
  );
};

export const findRolesByIds = (env: Env, companyId: string, roleIds: string[]) => {
  if (roleIds.length === 0) return Promise.resolve([]);
  const placeholders = roleIds.map(() => "?").join(", ");
  return many<{ id: string; role_key: string; role_name: string }>(
    env,
    `SELECT id, role_key, role_name FROM roles WHERE company_id = ? AND id IN (${placeholders}) AND is_active = 1`,
    [companyId, ...roleIds],
  );
};

export const findOutletsByIds = (env: Env, companyId: string, outletIds: string[]) => {
  if (outletIds.length === 0) return Promise.resolve([]);
  const placeholders = outletIds.map(() => "?").join(", ");
  return many<{ id: string }>(
    env,
    `SELECT id FROM outlets WHERE company_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [companyId, ...outletIds],
  );
};

export const replaceUserRoles = async (env: Env, companyId: string, userId: string, roleIds: string[]) => {
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("DELETE FROM user_roles WHERE company_id = ? AND user_id = ?").bind(companyId, userId),
    ...roleIds.map((roleId) =>
      env.DB.prepare("INSERT INTO user_roles (id, company_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), companyId, userId, roleId, now),
    ),
  ];
  await env.DB.batch(statements);
};

export const replaceUserOutlets = async (env: Env, companyId: string, userId: string, outletIds: string[]) => {
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("DELETE FROM user_outlets WHERE company_id = ? AND user_id = ?").bind(companyId, userId),
    ...outletIds.map((outletId) =>
      env.DB.prepare("INSERT INTO user_outlets (id, company_id, user_id, outlet_id, access_level, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, 'view_only', NULL, NULL, ?)")
        .bind(crypto.randomUUID(), companyId, userId, outletId, now),
    ),
  ];
  await env.DB.batch(statements);
};

export const countActiveSuperAdmins = async (env: Env, companyId: string, excludeUserId?: string): Promise<number> => {
  const values: unknown[] = [companyId];
  let exclude = "";
  if (excludeUserId) {
    exclude = "AND u.id <> ?";
    values.push(excludeUserId);
  }
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
      WHERE u.company_id = ?
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND r.role_key = 'super_admin'
        AND r.is_active = 1
        ${exclude}`,
    values,
  );
  return row?.total ?? 0;
};
