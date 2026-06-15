import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionRecord, UserRecord } from "../src/modules/auth/auth.types";
import { createSessionToken } from "../src/services/session.service";
import type { AppContext } from "../src/types/api.types";

const authRepoMock = vi.hoisted(() => ({
  session: null as SessionRecord | null,
  user: null as UserRecord | null,
  findSessionByTokenHash: vi.fn(async () => authRepoMock.session),
  findUserById: vi.fn(async () => authRepoMock.user),
  touchSession: vi.fn(async () => ({ success: true })),
  revokeSession: vi.fn(async () => ({ success: true })),
}));

const settingsMock = vi.hoisted(() => ({
  settings: {
    session_timeout_minutes: null as number | null,
    idle_timeout_minutes: null as number | null,
    concurrent_session_policy: "block_new_login" as const,
    allow_admin_session_override: false,
    session_device_tracking_enabled: true,
    remember_me_allowed: false,
    remember_me_session_days: null as number | null,
  },
  getSessionSecuritySettings: vi.fn(async () => settingsMock.settings),
}));

const permissionMock = vi.hoisted(() => ({
  getEffectivePermissions: vi.fn(async () => ({
    roles: [],
    permissions: ["dashboard.view"],
    outletIds: [],
  })),
}));

vi.mock("../src/modules/auth/auth.repository", () => authRepoMock);
vi.mock("../src/services/settings.service", () => settingsMock);
vi.mock("../src/services/permission.service", () => permissionMock);
vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

const env = {
  SESSION_SECRET: "session-timeout-test-secret",
  ENVIRONMENT: "test",
  CORS_ALLOWED_ORIGINS: "https://app.example.test",
} as Env;

const now = Date.parse("2026-06-09T10:00:00.000Z");
const isoMinutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();
const isoMinutesFromNow = (minutes: number) => new Date(now + minutes * 60 * 1000).toISOString();
const sessionSettings = (overrides: Partial<typeof settingsMock.settings> = {}) => ({
  session_timeout_minutes: null,
  idle_timeout_minutes: null,
  concurrent_session_policy: "block_new_login" as const,
  allow_admin_session_override: false,
  session_device_tracking_enabled: true,
  remember_me_allowed: false,
  remember_me_session_days: null,
  ...overrides,
});

const baseUser = (): UserRecord => ({
  id: "user_session",
  company_id: "company_1",
  employee_id: "emp_1",
  full_name: "Session User",
  email: "session@example.test",
  phone: null,
  password_hash: "hash",
  password_algo: "pbkdf2_sha256",
  password_updated_at: null,
  password_reset_required: 0,
  failed_login_attempts: 0,
  locked_until: null,
  last_password_reset_at: null,
  two_factor_enabled: 0,
  status: "active",
  last_login_at: null,
  created_at: isoMinutesAgo(60),
  updated_at: isoMinutesAgo(60),
  deleted_at: null,
});

const baseSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "sess_1",
  company_id: "company_1",
  user_id: "user_session",
  session_token_hash: "hash",
  ip_address: "127.0.0.1",
  user_agent: "vitest",
  device_id: null,
  expires_at: isoMinutesFromNow(60),
  remember_me: 0,
  revoked_at: null,
  created_at: isoMinutesAgo(10),
  last_seen_at: isoMinutesAgo(1),
  ...overrides,
});

let app: Hono<AppContext> | null = null;

const createApp = async () => {
  if (app) return app;
  const { authMiddleware } = await import("../src/middleware/auth.middleware");
  const { errorMiddleware } = await import("../src/middleware/error.middleware");
  app = new Hono<AppContext>();
  app.onError((error, c) => {
    return errorMiddleware(error, c);
  });
  app.get("/protected", authMiddleware, (c) => c.json({ ok: true, user: c.get("authUser")?.actorUserId }));
  app.post("/protected", authMiddleware, (c) => c.json({ ok: true }));
  return app;
};

const requestProtected = async (headers: Record<string, string> = {}, method = "GET") => {
  const app = await createApp();
  return app.request("/protected", {
    method,
    headers: {
      Cookie: "hrm_session=raw-session-token",
      ...headers,
    },
  }, env);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  authRepoMock.user = baseUser();
  authRepoMock.session = baseSession();
  settingsMock.settings = sessionSettings();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("settings-driven session timeout enforcement", () => {
  it("idle_timeout_minutes = 2 expires a session whose last_seen_at is older than 2 minutes", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });
    authRepoMock.session = baseSession({ last_seen_at: isoMinutesAgo(3) });

    const response = await requestProtected();
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("SESSION_EXPIRED");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired_idle_timeout");
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("idle_timeout_minutes = 2 does not expire an active session", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });
    authRepoMock.session = baseSession({ last_seen_at: isoMinutesAgo(1) });

    const response = await requestProtected();

    expect(response.status).toBe(200);
    expect(authRepoMock.revokeSession).not.toHaveBeenCalled();
    expect(authRepoMock.touchSession).toHaveBeenCalledWith(env, "sess_1");
  });

  it("session_timeout_minutes = 0 does not create an immediately expired session token", async () => {
    const token = await createSessionToken("secret", {
      ...sessionSettings({ idle_timeout_minutes: 2 }),
    });

    expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(now);
  });

  it("remember_me extends cookie expiry only when company settings allow it", async () => {
    const normalToken = await createSessionToken("secret", {
      ...sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: false, remember_me_session_days: 30 }),
    }, { rememberMe: true });
    const rememberedToken = await createSessionToken("secret", {
      ...sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: true, remember_me_session_days: 30 }),
    }, { rememberMe: true });

    expect(new Date(normalToken.expiresAt).getTime()).toBeLessThan(now + 10 * 60 * 1000);
    expect(new Date(rememberedToken.expiresAt).getTime()).toBeGreaterThan(now + 29 * 24 * 60 * 60 * 1000);
  });

  it("session_timeout_minutes = 0 with idle_timeout_minutes = 2 still expires by idle timeout", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });
    authRepoMock.session = baseSession({ created_at: isoMinutesAgo(20), last_seen_at: null });

    const response = await requestProtected();

    expect(response.status).toBe(401);
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired_idle_timeout");
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("session_timeout_minutes > 0 expires by created_at absolute timeout", async () => {
    settingsMock.settings = sessionSettings({ session_timeout_minutes: 5 });
    authRepoMock.session = baseSession({ created_at: isoMinutesAgo(6), last_seen_at: isoMinutesAgo(1) });

    const response = await requestProtected();

    expect(response.status).toBe(401);
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired_absolute_timeout");
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("remember_me=false with session_timeout_minutes = 5 expires after normal timeout", async () => {
    settingsMock.settings = sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: true, remember_me_session_days: 30 });
    authRepoMock.session = baseSession({
      remember_me: 0,
      created_at: isoMinutesAgo(6),
      last_seen_at: isoMinutesAgo(1),
      expires_at: isoMinutesFromNow(30 * 24 * 60),
    });

    const response = await requestProtected();

    expect(response.status).toBe(401);
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired_absolute_timeout");
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("remember_me=true from a disabled setting is stored as normal and still expires after normal timeout", async () => {
    settingsMock.settings = sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: false, remember_me_session_days: 30 });
    const token = await createSessionToken("secret", settingsMock.settings, { rememberMe: true });
    authRepoMock.session = baseSession({
      remember_me: token.rememberMe ? 1 : 0,
      created_at: isoMinutesAgo(6),
      last_seen_at: isoMinutesAgo(1),
      expires_at: isoMinutesFromNow(60),
    });

    const response = await requestProtected();

    expect(token.rememberMe).toBe(false);
    expect(response.status).toBe(401);
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired_absolute_timeout");
  });

  it("remember_me=true with enabled setting does not expire at the normal absolute timeout", async () => {
    settingsMock.settings = sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: true, remember_me_session_days: 30 });
    authRepoMock.session = baseSession({
      remember_me: 1,
      created_at: isoMinutesAgo(6),
      last_seen_at: isoMinutesAgo(1),
      expires_at: isoMinutesFromNow(30 * 24 * 60),
    });

    const response = await requestProtected();

    expect(response.status).toBe(200);
    expect(authRepoMock.revokeSession).not.toHaveBeenCalled();
    expect(authRepoMock.touchSession).toHaveBeenCalledWith(env, "sess_1");
  });

  it("remember_me=true with enabled setting still expires when expires_at is reached", async () => {
    settingsMock.settings = sessionSettings({ session_timeout_minutes: 5, remember_me_allowed: true, remember_me_session_days: 30 });
    authRepoMock.session = baseSession({
      remember_me: 1,
      created_at: isoMinutesAgo(6),
      last_seen_at: isoMinutesAgo(1),
      expires_at: isoMinutesAgo(1),
    });

    const response = await requestProtected();

    expect(response.status).toBe(401);
    expect(authRepoMock.revokeSession).toHaveBeenCalledWith(env, "sess_1", "session_expired");
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("background GET requests do not refresh last_seen_at", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });
    authRepoMock.session = baseSession({ last_seen_at: isoMinutesAgo(1) });

    const response = await requestProtected({ "X-HRM-Background-Request": "1" });

    expect(response.status).toBe(200);
    expect(authRepoMock.touchSession).not.toHaveBeenCalled();
  });

  it("user-activity requests refresh last_seen_at", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });
    authRepoMock.session = baseSession({ last_seen_at: isoMinutesAgo(1) });

    const response = await requestProtected({ "X-HRM-User-Activity": "1", "X-HRM-Background-Request": "1" });

    expect(response.status).toBe(200);
    expect(authRepoMock.touchSession).toHaveBeenCalledWith(env, "sess_1");
  });

  it("mutating requests refresh last_seen_at even without the activity header", async () => {
    settingsMock.settings = sessionSettings({ idle_timeout_minutes: 2 });

    const response = await requestProtected({}, "POST");

    expect(response.status).toBe(200);
    expect(authRepoMock.touchSession).toHaveBeenCalledWith(env, "sess_1");
  });
});
