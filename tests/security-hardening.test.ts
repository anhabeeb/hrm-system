import { describe, expect, it, vi } from "vitest";

import app from "../src/app";
import { getCorsHeaders } from "../src/middleware/cors.middleware";
import { getSecurityHeaders } from "../src/middleware/security.middleware";
import { toSafeJson } from "../src/modules/import-export/json-export.service";
import { maskSensitiveValue } from "../src/modules/reports/report-permission.service";
import { buildSessionCookie } from "../src/services/session.service";
import { AppError, PermissionError } from "../src/utils/errors";
import { buildSanitizedErrorLogPayload, logAppError } from "../src/utils/error-logger";
import { sanitizeSensitivePayload } from "../src/utils/sanitize";
import { safeAttachmentHeader, sanitizeDownloadFileName } from "../src/utils/security";
import { clearAuthToken, getAuthToken, setAuthToken } from "../frontend/src/lib/auth-token";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const env = {
  ENVIRONMENT: "local",
  CORS_ALLOWED_ORIGINS: "https://app.example.test",
} as Env;

describe("security hardening helpers", () => {
  it("recursively masks sensitive keys without mutating the original object", () => {
    const original = {
      user: {
        password_hash: "secret",
        profile: { passport_number: "A123", full_name: "Ahmed" },
      },
      file_key: "r2/private/key",
    };

    const sanitized = sanitizeSensitivePayload(original) as typeof original;

    expect(sanitized.user.password_hash).toBe("[REDACTED]");
    expect(sanitized.user.profile.passport_number).toBe("[REDACTED]");
    expect(sanitized.user.profile.full_name).toBe("Ahmed");
    expect(sanitized.file_key).toBe("[REDACTED]");
    expect(original.user.password_hash).toBe("secret");
  });

  it("keeps report and export sanitizers aligned", () => {
    expect(maskSensitiveValue({ device_token_hash: "hash" })).toEqual({ device_token_hash: "[REDACTED]" });
    expect(toSafeJson({ bank_account_number: "123" })).toContain("[REDACTED]");
  });
});

describe("Phase 13B security hardening", () => {
  it("session cookie includes secure browser flags", () => {
    const cookie = buildSessionCookie("session-token", "2027-01-01T00:00:00.000Z");

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("password");
  });

  it("security headers are present on API responses", async () => {
    const response = await app.request("/api/v1/health", {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("CORS allowlist does not use wildcard credentials", async () => {
    const allowed = getCorsHeaders("https://app.example.test", env) as Record<string, string>;
    const disallowed = getCorsHeaders("https://evil.example", env);

    expect(allowed).toMatchObject({
      "Access-Control-Allow-Origin": "https://app.example.test",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    });
    expect(allowed["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(disallowed).toEqual({});

    const preflight = await app.request("/api/v1/auth/login", {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.test" },
    }, env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.example.test");
    expect(preflight.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("disallowed cross-origin unsafe mutation is rejected", async () => {
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "admin@example.test", password: "Password123!" }),
    }, env);
    const body = await response.json() as { error?: { code?: string; details?: unknown } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("CSRF_ORIGIN_DENIED");
    expect(JSON.stringify(body)).not.toMatch(/stack|password_hash|session_token/i);
  });

  it("simple form-style unsafe mutation is rejected", async () => {
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://app.example.test",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "35",
      },
      body: "email=a@example.test&password=secret",
    }, env);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(415);
    expect(body.error?.code).toBe("UNSAFE_CONTENT_TYPE");
  });

  it("unsafe download filenames are sanitized", () => {
    expect(sanitizeDownloadFileName("../..\\secret\r\nbackup.json", "backup.json")).toBe("secret__backup.json");
    expect(safeAttachmentHeader("payroll \"summary\".csv", "report.csv")).toContain("filename=\"payroll _summary_.csv\"");
    const securityHeaders = getSecurityHeaders("/api/v1/documents/doc_1/download") as Record<string, string>;
    expect(securityHeaders["Cache-Control"]).toContain("no-store");
  });

  it("login and reset flows do not expose secrets", () => {
    const service = read("src/modules/auth/auth.service.ts");
    const repository = read("src/modules/auth/auth.repository.ts");

    expect(service).toContain("LOGIN_ERROR_MESSAGE");
    expect(service).toMatch(/hashToken\(token,\s*env\.SESSION_SECRET\)[\s\S]*createPasswordResetToken/);
    expect(service).toMatch(/verifyPassword\([\s\S]*input\.current_password[\s\S]*revokeUserSessions/);
    expect(repository).toMatch(/token_hash[\s\S]*expires_at[\s\S]*used_at/);
    expect(service).toMatch(/const toSafeUser[\s\S]*password_reset_required[\s\S]*password_updated_at/);
    expect(service).not.toMatch(/user:\s*{\s*\.\.\.user/);
  });

  it("device and biometric secrets are not returned", () => {
    const deviceAuth = read("src/middleware/device-auth.middleware.ts");
    const devices = read("src/modules/devices/devices.service.ts");
    const backup = read("src/modules/backup-recovery/backup-snapshot.service.ts");

    expect(deviceAuth).toMatch(/readBearerToken[\s\S]*authenticateDevice/);
    expect(devices).toMatch(/device_token_hash:\s*_tokenHash/);
    expect(backup).toMatch(/excluded_fields[\s\S]*device_token[\s\S]*raw_payload/);
  });

  it("file/export/backup dangerous paths keep permission and redaction guards", () => {
    expect(read("src/modules/documents/documents.controller.ts")).toContain("safeAttachmentHeader");
    expect(read("src/modules/report-exports/report-exports.controller.ts")).toContain("safeAttachmentHeader");
    expect(read("src/modules/backup-recovery/backup-recovery.service.ts")).toContain("safeAttachmentHeader");
    expect(read("src/modules/report-exports/report-exports.service.ts")).toMatch(/formula|spreadsheet|dangerous/i);
    expect(read("src/routes/report-exports.routes.ts")).toContain("report_exports.download");
    expect(read("src/routes/backup-recovery.routes.ts")).toContain("backup_recovery.restore.apply");
    expect(read("src/routes/data-retention.routes.ts")).toMatch(/data_retention\.archive[\s\S]*requireReason/);
  });

  it("login does not write any auth token to localStorage or sessionStorage", () => {
    const writes: string[] = [];
    const reads: string[] = [];
    const fakeStorage = {
      getItem: (key: string) => {
        reads.push(key);
        return "persisted-token";
      },
      setItem: (key: string) => writes.push(key),
      removeItem: (key: string) => writes.push(`remove:${key}`),
    };
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      localStorage: fakeStorage,
      sessionStorage: fakeStorage,
    };

    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    setAuthToken("memory-token");
    expect(getAuthToken()).toBe("memory-token");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();

    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("pending 2FA credentials and logout do not use browser token storage", () => {
    const authToken = read("frontend/src/lib/auth-token.ts");
    const authStore = read("frontend/src/features/auth/auth.store.tsx");

    expect(authToken).not.toMatch(/localStorage|sessionStorage|hrm\.auth\.token|TOKEN_STORAGE_KEY/);
    expect(authStore).toContain("setPendingTwoFactorLogin");
    expect(authStore).not.toContain("setAuthToken");
    expect(authStore).not.toContain("getAuthToken");
    expect(authStore).not.toMatch(/localStorage|sessionStorage/);
    expect(authStore).toMatch(/logout[\s\S]*clearAuthToken\(\)[\s\S]*applyUser\(null\)/);
  });

  it("API client does not attach Authorization from localStorage", () => {
    const apiClient = read("frontend/src/lib/api-client.ts");
    const bootstrapApi = read("frontend/src/features/bootstrap/bootstrap.api.ts");

    expect(apiClient).not.toContain("getAuthToken");
    expect(apiClient).not.toMatch(/Authorization["']?,\s*`Bearer/);
    expect(apiClient).toContain('credentials: "include"');
    expect(apiClient).toContain("X-HRM-User-Activity");
    expect(apiClient).toContain("X-HRM-Background-Request");
    expect(bootstrapApi).toMatch(/Authorization:\s*`Bearer \$\{token\}`/);
    expect(bootstrapApi).not.toMatch(/localStorage|sessionStorage|setAuthToken/);
  });

  it("settings-driven session timeouts are enforced before touching sessions", () => {
    const authMiddleware = read("src/middleware/auth.middleware.ts");
    const authService = read("src/modules/auth/auth.service.ts");
    const sessionService = read("src/services/session.service.ts");
    const settingsService = read("src/services/settings.service.ts");
    const errorMiddleware = read("src/middleware/error.middleware.ts");

    expect(settingsService).toContain("getSessionSecuritySettings");
    expect(settingsService).toContain("session_timeout_minutes");
    expect(settingsService).toContain("idle_timeout_minutes");
    expect(authMiddleware).toMatch(/getSessionSecuritySettings[\s\S]*absoluteExpired[\s\S]*idleExpired[\s\S]*sessionExpired/);
    expect(authMiddleware).toMatch(/if \(absoluteExpired \|\| idleExpired\)[\s\S]*sessionExpired/);
    expect(authMiddleware.indexOf("if (absoluteExpired || idleExpired)")).toBeLessThan(authMiddleware.indexOf("touchSession"));
    expect(authMiddleware).toContain("X-HRM-Background-Request".toLowerCase());
    expect(authMiddleware).toContain("X-HRM-User-Activity".toLowerCase());
    expect(authService).toMatch(/getSessionSecuritySettings[\s\S]*createSessionToken\(env\.SESSION_SECRET,\s*sessionSettings,\s*\{/);
    expect(authService).toContain("rememberMe: options.rememberMe === true && sessionSettings.remember_me_allowed");
    expect(sessionService).toMatch(/session_timeout_minutes[\s\S]*SESSION_TTL_DAYS/);
    expect(errorMiddleware).toMatch(/SESSION_EXPIRED[\s\S]*Set-Cookie[\s\S]*buildClearSessionCookie/);
  });

  it("background auth and notification polling are marked as background requests", () => {
    const authApi = read("frontend/src/features/auth/api.ts");
    const notificationsApi = read("frontend/src/features/notifications/notifications.api.ts");
    const notificationBell = read("frontend/src/features/notifications/NotificationBell.tsx");
    const apiErrors = read("frontend/src/lib/api-errors.ts");
    const loginPage = read("frontend/src/features/auth/LoginPage.tsx");

    expect(authApi).toMatch(/me:\s*\(\)\s*=>\s*api\.get<MeResult>\("\/auth\/me",\s*\{\s*background:\s*true\s*\}\)/);
    expect(notificationsApi).toMatch(/unreadCount:[\s\S]*background:\s*true/);
    expect(notificationsApi).toMatch(/recentUnread:[\s\S]*background:\s*true/);
    expect(notificationBell).toContain("notificationsApi.recentUnread");
    expect(apiErrors).toContain("Your session expired due to inactivity. Please sign in again.");
    expect(apiErrors).toContain("/login?reason=session_expired");
    expect(loginPage).toContain("reason\") === \"session_expired");
  });

  it("error logger redacts sensitive details, messages, causes, and production stacks", () => {
    const original = new Error("database failed password=hunter2 token=abc123 file_key=r2/private/doc.pdf");
    original.stack = "Error: token=abc123\n    at secret(file_key=r2/private/doc.pdf)";
    const appError = new AppError({
      code: "TEST_ERROR",
      title: "Test error",
      message: "Could not load passport_number=A123456",
      technicalMessage: "provider secret=topsecret",
      statusCode: 500,
      details: {
        password: "hunter2",
        nested: { token: "abc123", note: "file_key=r2/private/doc.pdf" },
      },
      cause: new Error("cause device_token=raw-token"),
    });

    const payload = buildSanitizedErrorLogPayload({
      requestId: "req_1",
      environment: "production",
      route: "/api/v1/company/other-company",
      method: "GET",
      appError,
      originalError: original,
    });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/hunter2|abc123|topsecret|r2\/private|A123456|raw-token/);
    expect(payload.error.stack).toBeNull();
    expect(payload.error.details).toContain("[REDACTED]");
  });

  it("system_error_logs stores sanitized stack values outside production", async () => {
    const inserted: unknown[] = [];
    const db = {
      prepare: (sql: string) => ({
        first: async () => sql.includes("sqlite_master") ? ({ name: "system_error_logs" }) : null,
        bind: (...values: unknown[]) => {
          inserted.push(...values);
          return { run: async () => ({ success: true }) };
        },
      }),
    };
    const original = new Error("token=raw-token file_key=r2/private/key");
    original.stack = "Error: token=raw-token\n at file_key=r2/private/key";
    const appError = new AppError({
      code: "TEST_ERROR",
      title: "Test",
      message: "password=hunter2",
      technicalMessage: "secret=topsecret",
      statusCode: 500,
    });
    const context = {
      env: { DB: db, ENVIRONMENT: "local" },
      req: { path: "/api/v1/test", method: "POST" },
      get: (key: string) =>
        key === "requestId"
          ? "req_1"
          : key === "authUser"
            ? { actorUserId: "user_1", companyId: "company_1", outletIds: [] }
            : undefined,
    };

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await logAppError(context as never, appError, original);
    } finally {
      consoleError.mockRestore();
    }
    const stored = JSON.stringify(inserted);

    expect(stored).not.toMatch(/hunter2|raw-token|topsecret|r2\/private/);
    expect(stored).toContain("[REDACTED]");
  });

  it("permission errors do not leak cross-company record details in sanitized logs", () => {
    const permissionError = new PermissionError("You do not have permission to perform this action.");
    permissionError.details = {
      company_id: "company_allowed",
      requested_company_id: "company_other",
      token: "secret-token",
    };
    const payload = buildSanitizedErrorLogPayload({
      environment: "production",
      route: "/api/v1/employees/emp_other_company",
      method: "GET",
      appError: permissionError,
      originalError: new Error("Permission denied for token=secret-token"),
    });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("company_other");
    expect(payload.error.stack).toBeNull();
    expect(payload.error.details).toBeUndefined();
    expect(serialized).toContain("PERMISSION_DENIED");
  });
});
