import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateKycUpdateRequestInput, validateLoginInput } from "../src/modules/auth/auth.validators";
import { PASSWORD_HASH_ALGORITHM, PASSWORD_HASH_VERSION, PBKDF2_MAX_WORKERS_ITERATIONS } from "../src/modules/auth/auth.constants";
import { hashPassword, passwordNeedsRehash, resolvePasswordHashConfig, verifyPassword } from "../src/services/password.service";
import { ValidationError } from "../src/utils/errors";
import type { SessionRecord, TwoFactorRecord, UserRecord } from "../src/modules/auth/auth.types";

const defaultSessionSettings = () => ({
  session_timeout_minutes: null as number | null,
  idle_timeout_minutes: null as number | null,
  concurrent_session_policy: "block_new_login" as "block_new_login" | "revoke_old_session",
  allow_admin_session_override: false,
  session_device_tracking_enabled: true,
});

const authRepoMock = vi.hoisted(() => {
  const state = {
    users: new Map<string, UserRecord>(),
    twoFactors: new Map<string, TwoFactorRecord>(),
    sessions: [] as SessionRecord[],
    kycRequests: [] as Array<{
      id: string;
      companyId: string;
      userId: string;
      employeeId: string | null;
      requestType: string;
      requestedValueJson: string;
      oldValueJson?: string | null;
      reason: string | null;
    }>,
  };

  return {
    state,
    findUserByEmail: vi.fn(async (_env: Env, email: string) => {
      const normalized = email.toLowerCase();
      const matches = [...state.users.values()].filter((user) => user.email?.toLowerCase() === normalized && !user.deleted_at);
      return new Set(matches.map((user) => user.id)).size === 1 ? matches[0] ?? null : null;
    }),
    findUserByLoginIdentifier: vi.fn(async (_env: Env, identifier: string) => {
      const normalized = identifier.toLowerCase();
      const matches = [...state.users.values()].filter((user) =>
        user.email?.toLowerCase() === normalized || user.username?.toLowerCase() === normalized,
      );
      return new Set(matches.map((user) => user.id)).size === 1 ? matches[0] ?? null : null;
    }),
    findLinkedEmployeeLoginStatus: vi.fn(async (_env: Env, companyId: string, employeeId: string) => {
      if (employeeId === "emp_archived") {
        return { id: employeeId, employment_status: "archived", deleted_at: null };
      }
      if (employeeId === "emp_deleted") {
        return { id: employeeId, employment_status: "active", deleted_at: new Date().toISOString() };
      }
      return { id: employeeId, employment_status: "active", deleted_at: null };
    }),
    findUserByEmailInCompany: vi.fn(async (_env: Env, companyId: string, email: string) => {
      const normalized = email.toLowerCase();
      return [...state.users.values()].find((user) => user.company_id === companyId && user.email?.toLowerCase() === normalized && !user.deleted_at) ?? null;
    }),
    findUserById: vi.fn(async (_env: Env, id: string) => state.users.get(id) ?? null),
    getUserRoles: vi.fn(async () => []),
    getUserPermissions: vi.fn(async () => []),
    getUserOutletIds: vi.fn(async () => []),
    getEnabledFeatureKeys: vi.fn(async () => []),
    updateFailedLogin: vi.fn(async (_env: Env, userId: string, failedAttempts: number, lockedUntil: string | null) => {
      const user = state.users.get(userId);
      if (user) {
        user.failed_login_attempts = failedAttempts;
        user.locked_until = lockedUntil;
      }
    }),
    resetFailedLogin: vi.fn(async (_env: Env, userId: string) => {
      const user = state.users.get(userId);
      if (user) {
        user.failed_login_attempts = 0;
        user.locked_until = null;
        user.last_login_at = new Date().toISOString();
      }
    }),
    updatePassword: vi.fn(async (_env: Env, userId: string, passwordHash: string, passwordAlgo: string) => {
      const user = state.users.get(userId);
      if (user) {
        user.password_hash = passwordHash;
        user.password_algo = passwordAlgo;
      }
    }),
    createSession: vi.fn(async (_env: Env, session: {
      id: string;
      companyId: string;
      userId: string;
      tokenHash: string;
      ipAddress: string | null;
      userAgent: string | null;
      deviceId: string | null;
      expiresAt: string;
      deviceLabel?: string | null;
      userAgentSummary?: string | null;
      ipSummary?: string | null;
    }) => {
      state.sessions.push({
        id: session.id,
        company_id: session.companyId,
        user_id: session.userId,
        session_token_hash: session.tokenHash,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
        device_id: session.deviceId,
        expires_at: session.expiresAt,
        revoked_at: null,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        device_label: session.deviceLabel ?? null,
        user_agent_summary: session.userAgentSummary ?? null,
        ip_summary: session.ipSummary ?? null,
        revoked_reason: null,
        revoked_by: null,
      });
    }),
    countActiveSessions: vi.fn(async () => state.sessions.filter((session) => !session.revoked_at).length),
    getTwoFactorByUserId: vi.fn(async (_env: Env, userId: string) =>
      [...state.twoFactors.values()].find((record) => record.user_id === userId && record.method === "totp") ?? null,
    ),
    createOrUpdateTwoFactor: vi.fn(async (
      _env: Env,
      input: {
        id: string;
        companyId: string;
        userId: string;
        secretEncrypted: string;
        backupCodesHashJson: string | null;
        enabledAt: string | null;
      },
    ) => {
      const existing = state.twoFactors.get(input.id);
      state.twoFactors.set(input.id, {
        id: input.id,
        company_id: input.companyId,
        user_id: input.userId,
        method: "totp",
        secret_encrypted: input.secretEncrypted,
        backup_codes_hash_json: input.backupCodesHashJson,
        enabled_at: input.enabledAt,
        disabled_at: null,
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }),
    updateTwoFactorBackupCodes: vi.fn(async (_env: Env, twoFactorId: string, backupCodesHashJson: string) => {
      const record = state.twoFactors.get(twoFactorId);
      if (record) {
        record.backup_codes_hash_json = backupCodesHashJson;
      }
    }),
    setUserTwoFactorEnabled: vi.fn(async (_env: Env, userId: string, enabled: boolean) => {
      const user = state.users.get(userId);
      if (user) {
        user.two_factor_enabled = enabled ? 1 : 0;
      }
    }),
    disableTwoFactor: vi.fn(async (_env: Env, userId: string) => {
      const record = [...state.twoFactors.values()].find((twoFactor) => twoFactor.user_id === userId);
      if (record) {
        record.disabled_at = new Date().toISOString();
      }
    }),
    createPasswordResetToken: vi.fn(),
    findPasswordResetToken: vi.fn(),
    markPasswordResetTokenUsed: vi.fn(),
    revokeUserSessions: vi.fn(async (_env: Env, userId: string, exceptSessionId?: string, reason = "user_sessions_revoked", revokedBy?: string | null) => {
      const revokedAt = new Date().toISOString();
      for (const session of state.sessions) {
        if (session.user_id === userId && !session.revoked_at && session.id !== exceptSessionId) {
          session.revoked_at = revokedAt;
          session.revoked_reason = reason;
          session.revoked_by = revokedBy ?? null;
        }
      }
    }),
    findSessionByTokenHash: vi.fn(),
    listUnrevokedSessionsForUser: vi.fn(async (_env: Env, companyId: string, userId: string) =>
      state.sessions.filter((session) => session.company_id === companyId && session.user_id === userId && !session.revoked_at),
    ),
    findSessionById: vi.fn(async (_env: Env, companyId: string, sessionId: string) =>
      state.sessions.find((session) => session.company_id === companyId && session.id === sessionId) ?? null,
    ),
    touchSession: vi.fn(),
    revokeSession: vi.fn(async (_env: Env, sessionId: string, reason = "session_revoked", revokedBy?: string | null) => {
      const session = state.sessions.find((record) => record.id === sessionId);
      if (session && !session.revoked_at) {
        session.revoked_at = new Date().toISOString();
        session.revoked_reason = reason;
        session.revoked_by = revokedBy ?? null;
      }
    }),
    createKycRequest: vi.fn(async (_env: Env, input: {
      id: string;
      companyId: string;
      userId: string;
      employeeId: string | null;
      requestType: string;
      requestedValueJson: string;
      oldValueJson?: string | null;
      reason: string | null;
    }) => {
      state.kycRequests.push(input);
    }),
    listOwnKycRequests: vi.fn(),
    findOwnKycRequest: vi.fn(),
  };
});

vi.mock("../src/modules/auth/auth.repository", () => authRepoMock);
const auditServiceMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(async () => ({ created: true, message: "Audit log recorded." })),
}));

vi.mock("../src/services/audit.service", () => auditServiceMock);
const settingsServiceMock = vi.hoisted(() => ({
  settings: {
    session_timeout_minutes: null as number | null,
    idle_timeout_minutes: null as number | null,
    concurrent_session_policy: "block_new_login" as "block_new_login" | "revoke_old_session",
    allow_admin_session_override: false,
    session_device_tracking_enabled: true,
  },
  getSessionSecuritySettings: vi.fn(async () => settingsServiceMock.settings),
}));

vi.mock("../src/services/settings.service", () => settingsServiceMock);

const testRequest = {
  requestId: "req_auth_test",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  deviceId: null,
};

const testEnv = {
  SESSION_SECRET: "session-secret-for-2fa-tests",
  PASSWORD_PEPPER: "pepper-for-test",
  TOTP_ENCRYPTION_KEY: "totp-encryption-secret-for-tests",
  ENVIRONMENT: "test",
} as Env;

const createTestUser = async (): Promise<UserRecord> => ({
  id: "user_2fa",
  company_id: "company_1",
  employee_id: null,
  username: "twofactor.user",
  full_name: "Two Factor User",
  email: "twofactor@example.com",
  phone: null,
  password_hash: await hashPassword("SecurePass123", testEnv.PASSWORD_PEPPER),
  password_algo: PASSWORD_HASH_ALGORITHM,
  password_updated_at: new Date().toISOString(),
  password_reset_required: 0,
  failed_login_attempts: 0,
  locked_until: null,
  last_password_reset_at: null,
  two_factor_enabled: 0,
  status: "active",
  last_login_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
});

const createSessionRecord = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `sess_${Math.random().toString(36).slice(2, 8)}`,
  company_id: "company_1",
  user_id: "user_2fa",
  session_token_hash: "stored-token-hash",
  ip_address: "198.51.100.45",
  user_agent: "Mozilla/5.0 Chrome/120.0 device details",
  device_id: null,
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  revoked_at: null,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  last_seen_at: new Date(Date.now() - 60 * 1000).toISOString(),
  device_label: "Chrome on Windows",
  user_agent_summary: "Chrome on Windows",
  ip_summary: "198.51.x.x",
  revoked_reason: null,
  revoked_by: null,
  ...overrides,
});

beforeEach(async () => {
  vi.clearAllMocks();
  authRepoMock.state.users.clear();
  authRepoMock.state.twoFactors.clear();
  authRepoMock.state.sessions.length = 0;
  authRepoMock.state.kycRequests.length = 0;
  settingsServiceMock.settings = defaultSessionSettings();
  const user = await createTestUser();
  authRepoMock.state.users.set(user.id, user);
});

describe("auth password handling", () => {
  it("does not store the raw password in the encoded hash", async () => {
    const password = "SecurePass123";
    const hash = await hashPassword(password, "pepper-for-test");

    expect(hash).not.toBe(password);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash, "pepper-for-test")).toBe(true);
    expect(await verifyPassword("WrongPass123", hash, "pepper-for-test")).toBe(false);
  });

  it("hashPassword succeeds with the Cloudflare Workers-compatible 100000 iteration limit", async () => {
    const hash = await hashPassword("SecurePass123", "pepper-for-test");
    const [algorithm, version, iterations] = hash.split("$");

    expect(algorithm).toBe(PASSWORD_HASH_ALGORITHM);
    expect(version).toBe(PASSWORD_HASH_VERSION);
    expect(Number(iterations)).toBe(PBKDF2_MAX_WORKERS_ITERATIONS);
  });

  it("clamps requested PBKDF2 iterations above the Workers limit", async () => {
    const config = resolvePasswordHashConfig({ PASSWORD_HASH_ITERATIONS: "210000" });

    expect(config.iterations).toBe(PBKDF2_MAX_WORKERS_ITERATIONS);
  });

  it("hashPassword never encodes more than 100000 PBKDF2 iterations in Worker mode", async () => {
    const hash = await hashPassword("SecurePass123", "pepper-for-test", {
      PASSWORD_HASH_ITERATIONS: "210000",
    });
    const [, , iterations] = hash.split("$");

    expect(Number(iterations)).toBe(PBKDF2_MAX_WORKERS_ITERATIONS);
  });

  it("verifyPassword uses the iteration count stored in the password hash", async () => {
    const hash = await hashPassword("SecurePass123", "pepper-for-test", {
      PASSWORD_HASH_ITERATIONS: "90000",
    });

    expect(hash.split("$")[2]).toBe("90000");
    expect(await verifyPassword("SecurePass123", hash, "pepper-for-test")).toBe(true);
    expect(passwordNeedsRehash(hash)).toBe(true);
  });
});

describe("my profile KYC validation", () => {
  it("rejects role, permission, and outlet access change requests", () => {
    expect(() =>
      validateKycUpdateRequestInput({
        request_type: "role",
        requested_value_json: {
          role: "admin",
        },
      }),
    ).toThrow(ValidationError);

    expect(() =>
      validateKycUpdateRequestInput({
        request_type: "permission_update",
        requested_value_json: {
          permission: "payroll.approve",
        },
      }),
    ).toThrow(ValidationError);

    expect(() =>
      validateKycUpdateRequestInput({
        request_type: "outlet_access",
        requested_value_json: {
          outlet_id: "outlet_123",
        },
      }),
    ).toThrow(ValidationError);
  });
});

describe("username or email login", () => {
  it("validates identifier or legacy email without requiring email format", () => {
    expect(validateLoginInput({ identifier: "  twofactor.user  ", password: "SecurePass123" })).toMatchObject({
      identifier: "twofactor.user",
      password: "SecurePass123",
    });
    expect(validateLoginInput({ email: "TWOFACTOR@example.com", password: "SecurePass123" })).toMatchObject({
      identifier: "twofactor@example.com",
      password: "SecurePass123",
    });
    expect(() => validateLoginInput({ identifier: "", password: "SecurePass123" })).toThrow("Username or email is required.");
  });

  it("logs in with email or username using trim and case-insensitive matching", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const emailResult = await authService.login(
      testEnv,
      { identifier: "  TWOFACTOR@example.com  ", password: "SecurePass123" },
      testRequest,
    );
    expect(emailResult.response.user?.email).toBe("twofactor@example.com");

    authRepoMock.state.sessions.length = 0;
    const usernameResult = await authService.login(
      testEnv,
      { identifier: "  TWOFACTOR.USER  ", password: "SecurePass123" },
      testRequest,
    );
    expect(usernameResult.response.user?.email).toBe("twofactor@example.com");
  });

  it("keeps legacy email payload login compatible", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const result = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );

    expect(result.response.user?.id).toBe("user_2fa");
  });

  it("uses a generic failure for unknown identifiers and wrong passwords", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    await expect(authService.login(
      testEnv,
      { identifier: "missing.user", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });

    await expect(authService.login(
      testEnv,
      { identifier: "twofactor.user", password: "WrongPass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });
  });

  it("does not authenticate disabled or archived employee-linked users", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    const disabledUser = { ...(await createTestUser()), id: "user_disabled", username: "disabled.user", email: "disabled@example.com", status: "disabled" };
    const archivedEmployeeUser = { ...(await createTestUser()), id: "user_archived_employee", username: "archived.employee", email: "archived@example.com", employee_id: "emp_archived" };
    authRepoMock.state.users.set(disabledUser.id, disabledUser);
    authRepoMock.state.users.set(archivedEmployeeUser.id, archivedEmployeeUser);

    await expect(authService.login(
      testEnv,
      { identifier: "disabled.user", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });

    await expect(authService.login(
      testEnv,
      { identifier: "archived.employee", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });
  });

  it("does not authenticate ambiguous duplicate username or email matches", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    const duplicateByUsername = { ...(await createTestUser()), id: "user_dup_username", username: "twofactor.user", email: "other@example.com" };
    const duplicateByEmail = { ...(await createTestUser()), id: "user_dup_email", username: "other.user", email: "twofactor@example.com" };
    authRepoMock.state.users.set(duplicateByUsername.id, duplicateByUsername);
    authRepoMock.state.users.set(duplicateByEmail.id, duplicateByEmail);

    await expect(authService.login(
      testEnv,
      { identifier: "twofactor.user", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });

    await expect(authService.login(
      testEnv,
      { identifier: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({ message: "Invalid username/email or password." });
  });
});

describe("my profile email update requests", () => {
  it("normalizes and stores email_update as a pending request without changing the login email", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const result = await authService.createKycRequest(
      testEnv,
      "user_2fa",
      {
        request_type: "email_update",
        requested_value_json: { email: "NEW.EMAIL@Example.COM" },
        reason: "Changing login email",
      },
      testRequest,
    );

    expect(result.response.status).toBe("pending");
    expect(authRepoMock.state.users.get("user_2fa")?.email).toBe("twofactor@example.com");
    expect(authRepoMock.state.kycRequests).toHaveLength(1);
    expect(JSON.parse(authRepoMock.state.kycRequests[0]?.requestedValueJson ?? "{}")).toEqual({ email: "new.email@example.com" });
    expect(JSON.parse(authRepoMock.state.kycRequests[0]?.oldValueJson ?? "{}")).toEqual({ email: "twofactor@example.com" });
  });

  it("rejects invalid, unchanged, and duplicate email_update requests", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    const duplicateUser = await createTestUser();
    authRepoMock.state.users.set("user_duplicate", {
      ...duplicateUser,
      id: "user_duplicate",
      email: "taken@example.com",
    });

    await expect(authService.createKycRequest(testEnv, "user_2fa", {
      request_type: "email_update",
      requested_value_json: { email: "not-an-email" },
      reason: "Testing",
    }, testRequest)).rejects.toMatchObject({ code: "INVALID_EMAIL" });

    await expect(authService.createKycRequest(testEnv, "user_2fa", {
      request_type: "email_update",
      requested_value_json: { email: "twofactor@example.com" },
      reason: "Testing",
    }, testRequest)).rejects.toMatchObject({ code: "EMAIL_UNCHANGED" });

    await expect(authService.createKycRequest(testEnv, "user_2fa", {
      request_type: "email_update",
      requested_value_json: { email: "taken@example.com" },
      reason: "Testing",
    }, testRequest)).rejects.toMatchObject({ code: "DUPLICATE_USER_EMAIL" });
  });
});

describe("single active session policy", () => {
  it("first login succeeds and creates a safely summarized session", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const result = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );

    expect(result.response.user).toBeTruthy();
    expect(result.response.user?.email).toBe("twofactor@example.com");
    expect(result.cookie).toContain("session=");
    expect(authRepoMock.state.sessions).toHaveLength(1);
    expect(authRepoMock.state.sessions[0]).toMatchObject({
      user_id: "user_2fa",
      device_label: "Browser on Unknown OS",
      user_agent_summary: "Browser on Unknown OS",
      ip_summary: "127.0.x.x",
    });
  });

  it("blocks a second login when concurrent_session_policy is block_new_login", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    authRepoMock.state.sessions.push(createSessionRecord({ id: "sess_existing" }));

    await expect(authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    )).rejects.toMatchObject({
      code: "ACTIVE_SESSION_EXISTS",
      statusCode: 409,
      message: "This user is already signed in on another device. Please logout from that device or ask an administrator to revoke the session.",
    });

    expect(authRepoMock.createSession).not.toHaveBeenCalled();
    expect(auditServiceMock.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "login_blocked_active_session_exists",
      entityType: "session",
    }));
  });

  it("ACTIVE_SESSION_EXISTS does not leak raw device or IP details", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    authRepoMock.state.sessions.push(createSessionRecord({
      ip_address: "203.0.113.99",
      user_agent: "Sensitive Browser Raw UA token=secret",
    }));

    let blockedError: unknown;
    try {
      await authService.login(
        testEnv,
        { email: "twofactor@example.com", password: "SecurePass123" },
        testRequest,
      );
    } catch (error) {
      blockedError = error;
    }

    expect(blockedError).toMatchObject({ code: "ACTIVE_SESSION_EXISTS" });
    const serialized = JSON.stringify(blockedError);
    expect(serialized).not.toContain("203.0.113.99");
    expect(serialized).not.toContain("Sensitive Browser Raw UA");
    expect(serialized).not.toContain("token=secret");
  });

  it("revokes old active sessions and creates a new one when policy is revoke_old_session", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    settingsServiceMock.settings = defaultSessionSettings();
    settingsServiceMock.settings.concurrent_session_policy = "revoke_old_session";
    authRepoMock.state.sessions.push(createSessionRecord({ id: "sess_old" }));

    const result = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );

    expect(result.cookie).toContain("session=");
    expect(authRepoMock.state.sessions.find((session) => session.id === "sess_old")?.revoked_reason).toBe("replaced_by_new_login");
    expect(authRepoMock.state.sessions.filter((session) => !session.revoked_at)).toHaveLength(1);
    expect(auditServiceMock.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "old_sessions_revoked_by_new_login",
    }));
  });

  it("expired, idle-expired, and revoked sessions do not block a new login", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    settingsServiceMock.settings = defaultSessionSettings();
    settingsServiceMock.settings.idle_timeout_minutes = 2;
    authRepoMock.state.sessions.push(
      createSessionRecord({ id: "sess_expired", expires_at: new Date(Date.now() - 1000).toISOString() }),
      createSessionRecord({ id: "sess_idle", last_seen_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() }),
      createSessionRecord({ id: "sess_revoked", revoked_at: new Date().toISOString() }),
    );

    await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );

    expect(authRepoMock.state.sessions.find((session) => session.id === "sess_expired")?.revoked_reason).toBe("expired_before_login");
    expect(authRepoMock.state.sessions.find((session) => session.id === "sess_idle")?.revoked_reason).toBe("expired_before_login");
    expect(authRepoMock.createSession).toHaveBeenCalledTimes(1);
  });

  it("checks active sessions only after a valid 2FA login challenge", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    const setup = await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);
    const setupCode = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);
    await authService.verifyTwoFactor(testEnv, "user_2fa", { code: setupCode }, testRequest);

    const challenge = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );
    expect(challenge.response.two_factor_required).toBe(true);
    expect(authRepoMock.listUnrevokedSessionsForUser).not.toHaveBeenCalled();

    authRepoMock.state.sessions.push(createSessionRecord({ id: "sess_after_2fa" }));
    const loginCode = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);

    await expect(authService.verifyLoginTwoFactorChallenge(
      testEnv,
      { challenge_id: challenge.response.challenge_id as string, code: loginCode },
      testRequest,
    )).rejects.toMatchObject({ code: "ACTIVE_SESSION_EXISTS" });
  });

  it("lets users view and revoke only their own sessions through safe DTOs", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    authRepoMock.state.sessions.push(createSessionRecord({ id: "sess_current" }));

    const sessions = await authService.listOwnSessions(testEnv, "user_2fa", "sess_current");
    expect(sessions).toEqual([
      expect.objectContaining({
        id: "sess_current",
        current: true,
        device_label: "Chrome on Windows",
        ip_summary: "198.51.x.x",
      }),
    ]);
    expect(JSON.stringify(sessions)).not.toContain("session_token_hash");
    expect(JSON.stringify(sessions)).not.toContain("203.0.113");

    const result = await authService.revokeOwnSession(testEnv, "user_2fa", "sess_current", "sess_current", testRequest);
    expect(result.cookie).toContain("Max-Age=0");
    expect(authRepoMock.state.sessions[0]?.revoked_reason).toBe("user_revoked_own_session");
  });

  it("blocks users from revoking another user's session", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    authRepoMock.state.sessions.push(createSessionRecord({
      id: "sess_other",
      user_id: "user_other",
    }));

    await expect(authService.revokeOwnSession(testEnv, "user_2fa", "sess_other", "sess_current", testRequest))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows admin session revocation and revoke-all with safe audit metadata", async () => {
    const authService = await import("../src/modules/auth/auth.service");
    const actor = {
      companyId: "company_1",
      actorUserId: "admin_1",
      fullName: "Admin",
      email: "admin@example.test",
      roles: ["admin"],
      roleKeys: ["admin"],
      permissions: ["users.sessions.view", "users.sessions.revoke", "users.sessions.revoke_all"],
      outletIds: [],
      isSuperAdmin: false,
      isAdmin: true,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    };
    authRepoMock.state.sessions.push(createSessionRecord({ id: "sess_admin_1" }), createSessionRecord({ id: "sess_admin_2" }));

    await authService.revokeUserSessionForAdmin(testEnv, actor, "user_2fa", "sess_admin_1", "Security support request.", testRequest);
    expect(authRepoMock.state.sessions.find((session) => session.id === "sess_admin_1")?.revoked_by).toBe("admin_1");

    await authService.revokeAllUserSessionsForAdmin(testEnv, actor, "user_2fa", "Admin terminated all active sessions.", testRequest);
    expect(authRepoMock.state.sessions.every((session) => session.revoked_at)).toBe(true);
    expect(auditServiceMock.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "admin_revoked_all_sessions",
      actorId: "admin_1",
      reason: "Admin terminated all active sessions.",
    }));
  });
});

describe("auth two-factor setup and login challenge", () => {
  it("returns authenticator setup data with a QR-compatible otpauth URL and manual key", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const result = await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);
    const setup = result.response;

    expect(setup.otpauth_url).toContain("otpauth://totp/");
    expect(setup.otpauth_url).toContain("secret=");
    expect(setup.otpauth_url).toContain("issuer=");
    expect(setup.otpauth_url).toContain("algorithm=SHA1");
    expect(setup.otpauth_url).toContain("digits=6");
    expect(setup.otpauth_url).toContain("period=30");
    expect(setup.manual_key).toMatch(/^[A-Z2-7 ]+$/);
    expect(setup.manual_setup_key).toMatch(/^[A-Z2-7]+$/);
    expect(setup.manual_key.replace(/\s/g, "")).toBe(setup.manual_setup_key);
    expect(JSON.stringify(setup)).not.toContain("secret_encrypted");
  });

  it("confirms TOTP setup with a valid code and returns backup codes only after enabling", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const setup = await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);
    const code = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);
    const result = await authService.verifyTwoFactor(testEnv, "user_2fa", { code }, testRequest);

    expect(result.response.enabled).toBe(true);
    expect(result.response.backup_codes).toHaveLength(10);
    expect(authRepoMock.state.users.get("user_2fa")?.two_factor_enabled).toBe(1);
    expect([...authRepoMock.state.twoFactors.values()][0]?.enabled_at).toBeTruthy();
  });

  it("returns a login-time 2FA challenge before creating a session", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const setup = await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);
    const code = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);
    await authService.verifyTwoFactor(testEnv, "user_2fa", { code }, testRequest);

    const result = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );

    expect(result.response.two_factor_required).toBe(true);
    expect(result.response.challenge_id).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(authRepoMock.state.sessions).toHaveLength(0);
  });

  it("verifies a login challenge and creates a session without exposing auth secrets", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    const setup = await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);
    const setupCode = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);
    await authService.verifyTwoFactor(testEnv, "user_2fa", { code: setupCode }, testRequest);
    const challenge = await authService.login(
      testEnv,
      { email: "twofactor@example.com", password: "SecurePass123" },
      testRequest,
    );
    expect(challenge.response.challenge_id).toBeTruthy();
    const loginCode = await authService.generateTotpCodeForSecret(setup.response.manual_setup_key);

    const result = await authService.verifyLoginTwoFactorChallenge(
      testEnv,
      { challenge_id: challenge.response.challenge_id as string, code: loginCode },
      testRequest,
    );

    expect(result.response.user.email).toBe("twofactor@example.com");
    expect(JSON.stringify(result.response.user)).not.toContain("password_hash");
    expect(JSON.stringify(result.response.user)).not.toContain("secret");
    expect(result.cookie).toContain("session=");
    expect(authRepoMock.state.sessions).toHaveLength(1);
  });

  it("rejects invalid setup confirmation codes with a user-friendly code", async () => {
    const authService = await import("../src/modules/auth/auth.service");

    await authService.setupTwoFactor(testEnv, "user_2fa", testRequest);

    await expect(authService.verifyTwoFactor(testEnv, "user_2fa", { code: "000000" }, testRequest)).rejects.toMatchObject({
      code: "INVALID_TWO_FACTOR_CODE",
      message: "The verification code is invalid or has expired.",
    });
  });
});
