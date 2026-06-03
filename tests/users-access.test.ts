import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import app from "../src/app";

interface TestUser {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  status: string;
  two_factor_enabled: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  password_hash?: string | null;
  password_algo?: string | null;
}

interface TestRole {
  id: string;
  company_id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface TestPermission {
  id: string;
  permission_key: string;
  module: string;
  action: string;
  description: string | null;
}

const now = "2026-06-01T00:00:00.000Z";
const future = "2099-01-01T00:00:00.000Z";

const baseUsers = (): TestUser[] => [
  {
    id: "user_admin",
    company_id: "company_1",
    full_name: "Admin User",
    email: "admin@example.com",
    status: "active",
    two_factor_enabled: 0,
    last_login_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    password_hash: "secret-hash",
    password_algo: "pbkdf2_sha256",
  },
  {
    id: "user_super_only",
    company_id: "company_1",
    full_name: "Only Super",
    email: "super@example.com",
    status: "active",
    two_factor_enabled: 1,
    last_login_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    password_hash: "super-secret-hash",
    password_algo: "pbkdf2_sha256",
  },
  {
    id: "user_staff",
    company_id: "company_1",
    full_name: "Staff User",
    email: "staff@example.com",
    status: "active",
    two_factor_enabled: 0,
    last_login_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    password_hash: "staff-secret-hash",
    password_algo: "pbkdf2_sha256",
  },
];

const baseRoles = (): TestRole[] => [
  { id: "role_admin", company_id: "company_1", role_key: "admin", role_name: "Admin", description: "Admin", is_system_role: 1, is_active: 1, created_at: now, updated_at: now },
  { id: "role_super", company_id: "company_1", role_key: "super_admin", role_name: "Super Admin", description: "Super", is_system_role: 1, is_active: 1, created_at: now, updated_at: now },
  { id: "role_hr", company_id: "company_1", role_key: "hr_manager", role_name: "HR Manager", description: "HR", is_system_role: 0, is_active: 1, created_at: now, updated_at: now },
  { id: "role_other_company", company_id: "company_2", role_key: "admin", role_name: "Other Admin", description: "Other", is_system_role: 1, is_active: 1, created_at: now, updated_at: now },
];

const basePermissions = (): TestPermission[] => [
  { id: "perm_users_view", permission_key: "users.view", module: "users", action: "view", description: "View users." },
  { id: "perm_users_create", permission_key: "users.create", module: "users", action: "create", description: "Create users." },
  { id: "perm_users_edit", permission_key: "users.edit", module: "users", action: "edit", description: "Edit users." },
  { id: "perm_users_disable", permission_key: "users.disable", module: "users", action: "disable", description: "Disable users." },
  { id: "perm_roles_view", permission_key: "roles.view", module: "roles", action: "view", description: "View roles." },
  { id: "perm_permissions_view", permission_key: "permissions.view", module: "permissions", action: "view", description: "View permissions." },
];

const createEnv = (options: { authUserId?: string } = {}) => {
  const authUserId = options.authUserId ?? "user_admin";
  const users = baseUsers();
  const roles = baseRoles();
  const permissions = basePermissions();
  const userRoles = [
    { user_id: "user_admin", role_id: "role_admin", company_id: "company_1" },
    { user_id: "user_super_only", role_id: "role_super", company_id: "company_1" },
    { user_id: "user_staff", role_id: "role_hr", company_id: "company_1" },
  ];
  const rolePermissions = permissions.map((permission) => ({
    role_id: "role_admin",
    company_id: "company_1",
    permission_key: permission.permission_key,
  }));
  const userOutlets = [
    { user_id: "user_admin", outlet_id: "outlet_1", company_id: "company_1" },
    { user_id: "user_staff", outlet_id: "outlet_1", company_id: "company_1" },
  ];

  const session = {
    id: "session_1",
    company_id: "company_1",
    user_id: authUserId,
    session_token_hash: "ignored-by-test-db",
    expires_at: future,
    revoked_at: null,
    created_at: now,
    last_seen_at: now,
  };

  const all = (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();

    if (normalized.includes("from user_roles ur join roles r") && normalized.includes("ur.user_id = ?") && !normalized.includes("in (")) {
      const [, userId] = values as string[];
      return userRoles
        .filter((row) => row.company_id === "company_1" && row.user_id === userId)
        .map((row) => roles.find((role) => role.id === row.role_id))
        .filter((role): role is TestRole => role !== undefined && role.is_active === 1)
        .map((role) => ({ id: role.id, role_key: role.role_key, role_name: role.role_name }));
    }

    if (normalized.includes("from role_permissions") && normalized.includes("role_id in")) {
      const [companyId, ...roleIds] = values as string[];
      return rolePermissions
        .filter((row) => row.company_id === companyId && roleIds.includes(row.role_id))
        .map((row) => ({ permission_key: row.permission_key }));
    }

    if (normalized.includes("from user_permission_overrides")) return [];

    if (normalized.includes("from user_outlets") && normalized.includes("user_id = ?")) {
      const [companyId, userId] = values as string[];
      return userOutlets.filter((row) => row.company_id === companyId && row.user_id === userId).map((row) => ({ outlet_id: row.outlet_id }));
    }

    if (normalized.includes("from users u") && normalized.includes("order by u.created_at")) {
      return users.filter((user) => user.company_id === values[0] && !user.deleted_at).map(({ password_hash: _hash, password_algo: _algo, ...user }) => user);
    }

    if (normalized.includes("from user_roles ur") && normalized.includes("ur.user_id in")) {
      const [companyId, ...userIds] = values as string[];
      return userRoles
        .filter((row) => row.company_id === companyId && userIds.includes(row.user_id))
        .map((row) => {
          const role = roles.find((candidate) => candidate.id === row.role_id);
          return role ? { user_id: row.user_id, role_id: role.id, role_name: role.role_name, role_key: role.role_key } : null;
        })
        .filter(Boolean);
    }

    if (normalized.includes("from user_outlets") && normalized.includes("user_id in")) {
      const [companyId, ...rest] = values as string[];
      const userIds = rest.slice(0, -1);
      return userOutlets.filter((row) => row.company_id === companyId && userIds.includes(row.user_id)).map((row) => ({ user_id: row.user_id, outlet_id: row.outlet_id }));
    }

    if (normalized.includes("from roles where company_id = ? and id in")) {
      const [companyId, ...roleIds] = values as string[];
      return roles.filter((role) => role.company_id === companyId && roleIds.includes(role.id) && role.is_active === 1).map(({ id, role_key, role_name }) => ({ id, role_key, role_name }));
    }

    if (normalized.includes("count(distinct u.id) as users_count")) {
      return roles
        .filter((role) => role.company_id === values[0])
        .map((role) => ({
          ...role,
          users_count: userRoles.filter((row) => row.company_id === role.company_id && row.role_id === role.id && users.some((user) => user.id === row.user_id && !user.deleted_at)).length,
        }));
    }

    if (normalized.includes("from permissions") && normalized.includes("order by module")) {
      return [...permissions].sort((left, right) =>
        `${left.module}.${left.action}.${left.permission_key}`.localeCompare(`${right.module}.${right.action}.${right.permission_key}`),
      );
    }

    return [];
  };

  const first = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();

    if (normalized.includes("from sessions")) return session;
    if (normalized === "select * from users where id = ? limit 1") {
      return users.find((user) => user.id === values[0]) ?? null;
    }
    if (normalized.includes("select count(*) as total from users u")) {
      return { total: users.filter((user) => user.company_id === values[0] && !user.deleted_at).length };
    }
    if (normalized.includes("from users where company_id = ? and id = ?")) {
      const [companyId, userId] = values as string[];
      const user = users.find((candidate) => candidate.company_id === companyId && candidate.id === userId && !candidate.deleted_at);
      if (!user) return null;
      const { password_hash: _hash, password_algo: _algo, ...safe } = user;
      return safe;
    }
    if (normalized.includes("from users where company_id = ? and lower(email)")) {
      const [companyId, email] = values as string[];
      return users.find((user) => user.company_id === companyId && user.email?.toLowerCase() === email.toLowerCase() && !user.deleted_at) ?? null;
    }
    if (normalized.includes("count(distinct u.id) as total") && normalized.includes("r.role_key = 'super_admin'")) {
      const companyId = values[0] as string;
      const excludeUserId = values[1] as string | undefined;
      const total = users.filter((user) => {
        if (user.company_id !== companyId || user.status !== "active" || user.deleted_at || user.id === excludeUserId) return false;
        const roleIds = userRoles.filter((row) => row.company_id === companyId && row.user_id === user.id).map((row) => row.role_id);
        return roles.some((role) => role.company_id === companyId && roleIds.includes(role.id) && role.role_key === "super_admin" && role.is_active === 1);
      }).length;
      return { total };
    }
    if (normalized.includes("select count(*) as total from roles r")) {
      return { total: roles.filter((role) => role.company_id === values[0]).length };
    }

    return null;
  };

  const run = async () => ({ success: true });

  const prepare = (sql: string) => {
    const statement = {
      bind: (...values: unknown[]) => ({
        first: () => first(sql, values),
        all: async () => ({ results: all(sql, values) }),
        run,
      }),
      first: () => first(sql, []),
      all: async () => ({ results: all(sql, []) }),
      run,
    };
    return statement;
  };

  return {
    ENVIRONMENT: "test",
    SESSION_SECRET: "test-secret",
    DB: { prepare, batch: async () => [] },
  } as unknown as Env;
};

const request = (path: string, init?: RequestInit, testEnv: Env = createEnv()) => app.request(path, init ?? {}, testEnv);
const authHeaders = { cookie: "hrm_session=test-token" };

describe("Users & Access API routes", () => {
  it.each(["/api/v1/users", "/api/v1/roles", "/api/v1/permissions"])(
    "%s requires authentication and is not missing",
    async (path) => {
      const response = await request(path);
      const body = await response.json() as { success: boolean; error: { code: string } };

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_REQUIRED");
    },
  );

  it("registers the expected Users & Access route files", () => {
    const appSource = readFileSync("src/app.ts", "utf8");

    expect(appSource).toContain('apiV1.route("/users", usersRoutes)');
    expect(appSource).toContain('apiV1.route("/roles", rolesRoutes)');
    expect(appSource).toContain('apiV1.route("/permissions", permissionsRoutes)');
  });

  it("keeps user API responses scoped to safe fields", () => {
    const typesSource = readFileSync("src/modules/users/users.types.ts", "utf8");
    const serviceSource = readFileSync("src/modules/users/users.service.ts", "utf8");

    const safeUserBlock = typesSource.slice(
      typesSource.indexOf("export interface SafeUser"),
      typesSource.indexOf("export interface UserListFilters"),
    );
    const attachAccessBlock = serviceSource.slice(
      serviceSource.indexOf("const attachAccess"),
      serviceSource.indexOf("const ensureUser"),
    );

    for (const secret of ["password_hash", "password_algo", "session_token_hash", "secret_encrypted", "backup_codes_hash_json"]) {
      expect(safeUserBlock).not.toContain(secret);
      expect(attachAccessBlock).not.toContain(secret);
    }
  });

  it("enables the live frontend Users & Access API integration flag", () => {
    const source = readFileSync("frontend/src/features/users/user-access.constants.ts", "utf8");

    expect(source).toContain("USER_ACCESS_API_CONNECTED = true");
  });

  it("GET /api/v1/users with users.view returns a paginated safe user list", async () => {
    const response = await request("/api/v1/users", { headers: authHeaders });
    const body = await response.json() as { success: boolean; data: Array<Record<string, unknown>>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pagination.total).toBe(3);
    expect(body.data[0]).toMatchObject({
      id: expect.any(String),
      full_name: expect.any(String),
      status: "active",
      roles: expect.any(Array),
      role_ids: expect.any(Array),
      outlet_ids: expect.any(Array),
      two_factor_enabled: expect.any(Boolean),
    });
  });

  it("GET /api/v1/users never returns password_hash or auth secrets", async () => {
    const response = await request("/api/v1/users", { headers: authHeaders });
    const text = await response.text();

    expect(response.status).toBe(200);
    for (const secret of ["password_hash", "password_algo", "session_token_hash", "secret_encrypted", "backup_codes_hash_json", "super-secret-hash"]) {
      expect(text).not.toContain(secret);
    }
  });

  it.todo("GET /api/v1/users/:id returns safe user detail without password or auth secrets");
  it("POST /api/v1/users rejects duplicate email within the same company", async () => {
    const response = await request("/api/v1/users", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ full_name: "Duplicate", email: "staff@example.com", status: "active" }),
    });
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("DUPLICATE_USER_EMAIL");
    expect(body.error.message).toBe("A user with this email already exists.");
  });

  it.todo("PATCH /api/v1/users/:id updates only allowed profile/access fields");
  it("POST /api/v1/users/:id/disable cannot disable the last active Super Admin", async () => {
    const response = await request("/api/v1/users/user_super_only/disable", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ reason: "Access review" }),
    });
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("At least one active Super Admin must remain in this company.");
  });

  it("POST /api/v1/users/:id/roles validates company-scoped roles", async () => {
    const response = await request("/api/v1/users/user_staff/roles", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ role_ids: ["role_other_company"], reason: "Testing tenant scope" }),
    });
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("ROLE_NOT_FOUND");
    expect(body.error.message).toBe("One or more selected roles could not be found.");
  });

  it("GET /api/v1/roles returns roles with users_count", async () => {
    const response = await request("/api/v1/roles", { headers: authHeaders });
    const body = await response.json() as { success: boolean; data: Array<{ id: string; users_count: number }> };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.find((role) => role.id === "role_admin")?.users_count).toBe(1);
    expect(body.data.find((role) => role.id === "role_super")?.users_count).toBe(1);
  });

  it.todo("GET /api/v1/roles/:id returns role permissions");
  it("GET /api/v1/permissions returns seeded permissions ordered by module/action/key", async () => {
    const response = await request("/api/v1/permissions", { headers: authHeaders });
    const body = await response.json() as { success: boolean; data: Array<{ permission_key: string; module: string; action: string }> };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((permission) => permission.permission_key)).toContain("users.view");
    expect(body.data.map((permission) => `${permission.module}.${permission.action}.${permission.permission_key}`)).toEqual(
      [...body.data.map((permission) => `${permission.module}.${permission.action}.${permission.permission_key}`)].sort(),
    );
  });

  it.todo("audit log failure does not fail user create/update/enable/disable/reset/role assignment");
});
