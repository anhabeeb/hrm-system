import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateKycUpdateRequestInput } from "../src/modules/auth/auth.validators";
import { PASSWORD_HASH_ALGORITHM, PASSWORD_HASH_VERSION, PBKDF2_MAX_WORKERS_ITERATIONS } from "../src/modules/auth/auth.constants";
import { hashPassword, passwordNeedsRehash, resolvePasswordHashConfig, verifyPassword } from "../src/services/password.service";
import { ValidationError } from "../src/utils/errors";
import type { TwoFactorRecord, UserRecord } from "../src/modules/auth/auth.types";

const authRepoMock = vi.hoisted(() => {
  const state = {
    users: new Map<string, UserRecord>(),
    twoFactors: new Map<string, TwoFactorRecord>(),
    sessions: [] as unknown[],
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
      return [...state.users.values()].find((user) => user.email?.toLowerCase() === normalized) ?? null;
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
    createSession: vi.fn(async (_env: Env, session: unknown) => {
      state.sessions.push(session);
    }),
    countActiveSessions: vi.fn(async () => state.sessions.length),
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
    revokeUserSessions: vi.fn(),
    findSessionByTokenHash: vi.fn(),
    touchSession: vi.fn(),
    revokeSession: vi.fn(),
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
vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true, message: "Audit log recorded." })),
}));

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

beforeEach(async () => {
  vi.clearAllMocks();
  authRepoMock.state.users.clear();
  authRepoMock.state.twoFactors.clear();
  authRepoMock.state.sessions.length = 0;
  authRepoMock.state.kycRequests.length = 0;
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

describe.todo("auth integration", () => {
  it.todo("login rejects a wrong password with a generic message");
  it.todo("forgot password does not reveal whether an email exists");
  it.todo("password reset tokens are stored only as hashes");
  it.todo("session tokens are stored only as hashes");
  it.todo("/me never returns password_hash or token hash fields");
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
