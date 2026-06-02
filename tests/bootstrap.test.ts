import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import app from "../src/app";
import { runBestEffortSetupSideEffects } from "../src/modules/bootstrap/bootstrap.controller";
import { BOOTSTRAP_MESSAGES, DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../src/modules/bootstrap/bootstrap.constants";
import { cloneCompanyDefaults, ensureCompanySuperAdminRole, findSystemBootstrap } from "../src/modules/bootstrap/bootstrap.repository";
import { getBootstrapStatus } from "../src/modules/bootstrap/bootstrap.service";
import { isStrongBootstrapPassword, validateBootstrapInitialize } from "../src/modules/bootstrap/bootstrap.validators";
import { ValidationError } from "../src/utils/errors";

const readText = (path: string) => readFileSync(path, "utf8");

describe("bootstrap validators", () => {
  it("requires a company name", () => {
    expect(() => validateBootstrapInitialize({
      company: {},
      super_admin: {
        full_name: "Ahmed Naish",
        email: "admin@example.com",
        password: "StrongPassword123!",
      },
    })).toThrow(ValidationError);
  });

  it("normalizes Super Admin email to lowercase", () => {
    const input = validateBootstrapInitialize({
      company: { company_name: "Ahmed HRM" },
      super_admin: {
        full_name: "Ahmed Naish",
        email: "ADMIN@EXAMPLE.COM",
        password: "StrongPassword123!",
      },
    });
    expect(input.super_admin.email).toBe("admin@example.com");
  });

  it("rejects weak bootstrap passwords", () => {
    expect(isStrongBootstrapPassword("password123")).toBe(false);
    expect(() => validateBootstrapInitialize({
      company: { company_name: "Ahmed HRM" },
      super_admin: {
        full_name: "Ahmed Naish",
        email: "admin@example.com",
        password: "password123",
      },
    })).toThrow(ValidationError);
  });

  it("accepts strong bootstrap passwords", () => {
    expect(isStrongBootstrapPassword("StrongPassword123!")).toBe(true);
  });

  it("uses Maldives defaults when optional company fields are missing", () => {
    const input = validateBootstrapInitialize({
      company: { company_name: "Ahmed HRM" },
      super_admin: {
        full_name: "Ahmed Naish",
        email: "admin@example.com",
        password: "StrongPassword123!",
      },
    });
    expect(input.company.country).toBe(DEFAULT_COUNTRY);
    expect(input.company.timezone).toBe(DEFAULT_TIMEZONE);
    expect(input.company.currency).toBe(DEFAULT_CURRENCY);
  });

  it("supports optional outlet data", () => {
    const input = validateBootstrapInitialize({
      company: { company_name: "Ahmed HRM" },
      super_admin: {
        full_name: "Ahmed Naish",
        email: "admin@example.com",
        password: "StrongPassword123!",
      },
      outlet: {
        outlet_name: "Head Office",
        outlet_code: "HO",
      },
    });
    expect(input.outlet?.outlet_name).toBe("Head Office");
  });

  it("uses user-friendly bootstrap messages", () => {
    expect(BOOTSTRAP_MESSAGES.required).toBe("Initial setup is required.");
    expect(BOOTSTRAP_MESSAGES.completed).toBe("Initial setup has already been completed.");
    expect(BOOTSTRAP_MESSAGES.invalidToken).toBe("Bootstrap token is invalid.");
  });

  it("system bootstrap migration creates the table and default row safely", () => {
    const migration = readText("migrations/0015_system_bootstrap.sql");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS system_bootstrap");
    expect(migration).toContain("id TEXT PRIMARY KEY DEFAULT 'default'");
    expect(migration).toContain("is_initialized INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("company_id TEXT");
    expect(migration).toContain("initialized_by_user_id TEXT");
    expect(migration).toContain("initialized_at TEXT");
    expect(migration).toContain("INSERT OR IGNORE INTO system_bootstrap");
    expect(migration).toContain("'default'");
  });

  it("system bootstrap migration is forward-only and idempotent", () => {
    const migration = readText("migrations/0015_system_bootstrap.sql");

    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS");
    expect(migration).toContain("INSERT OR IGNORE");
  });

  it("creates the missing default system bootstrap row before reading status", async () => {
    const executedSql: string[] = [];
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            run: async () => {
              executedSql.push(sql);
              return { success: true };
            },
            first: async () => {
              if (sql.includes("FROM system_bootstrap")) {
                return {
                  id: "default",
                  is_initialized: 0,
                  company_id: null,
                  initialized_by_user_id: null,
                  initialized_at: null,
                  created_at: "2026-06-03T00:00:00Z",
                  updated_at: "2026-06-03T00:00:00Z",
                };
              }
              return { total: 0 };
            },
          }),
        }),
      },
    } as unknown as Env;

    const row = await findSystemBootstrap(env);

    expect(row?.id).toBe("default");
    expect(executedSql.some((sql) => sql.includes("INSERT OR IGNORE INTO system_bootstrap"))).toBe(true);
  });

  it("setup status works when system bootstrap exists with the default row", async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => {
              if (sql.includes("FROM system_bootstrap")) {
                return {
                  id: "default",
                  is_initialized: 0,
                  company_id: null,
                  initialized_by_user_id: null,
                  initialized_at: null,
                  created_at: "2026-06-03T00:00:00Z",
                  updated_at: "2026-06-03T00:00:00Z",
                };
              }
              return { total: 0 };
            },
          }),
        }),
      },
    } as unknown as Env;

    await expect(getBootstrapStatus(env)).resolves.toEqual({ setup_required: true });
  });

  it("initialized system bootstrap row marks setup as completed", async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => {
              if (sql.includes("FROM system_bootstrap")) {
                return {
                  id: "default",
                  is_initialized: 1,
                  company_id: "company_1",
                  initialized_by_user_id: "user_1",
                  initialized_at: "2026-06-03T00:00:00Z",
                  created_at: "2026-06-03T00:00:00Z",
                  updated_at: "2026-06-03T00:00:00Z",
                };
              }
              return { total: 0 };
            },
          }),
        }),
      },
    } as unknown as Env;

    await expect(getBootstrapStatus(env)).resolves.toEqual({ setup_required: false });
  });

  it("does not fail bootstrap default cloning when optional defaults are unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let batchCalls = 0;
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...values: unknown[]) => ({ sql, values }),
        }),
        batch: async () => {
          batchCalls += 1;
          if (batchCalls > 1) {
            throw new Error("Optional table is not available.");
          }
          return [];
        },
      },
    } as unknown as Env;

    try {
      await expect(cloneCompanyDefaults(env, "company_1", {
        company_name: "Cafe Asiana",
        legal_name: null,
        registration_number: null,
        country: "MV",
        timezone: "Indian/Maldives",
        currency: "MVR",
      })).resolves.toBeUndefined();
      expect(batchCalls).toBeGreaterThan(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("ensures fallback Super Admin role uses the expected role key", async () => {
    let capturedValues: unknown[] = [];
    const env = {
      DB: {
        prepare: () => ({
          bind: (...values: unknown[]) => {
            capturedValues = values;
            return {
              run: async () => ({ success: true }),
            };
          },
        }),
      },
    } as unknown as Env;

    await ensureCompanySuperAdminRole(env, "company_1", {
      role_key: "SUPER_ADMIN",
      role_name: "Super Admin",
      description: "Full access",
      is_system_role: 1,
    });

    expect(capturedValues[0]).toBe("company_1_role_super_admin");
    expect(capturedValues[2]).toBe("super_admin");
  });

  it("setup side effects are best-effort and do not fail initialization", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(runBestEffortSetupSideEffects({
        requestId: "req_test",
        data: { company: { id: "company_1" } },
        hooks: [
          () => {
            throw new Error("Activity logging failed.");
          },
        ],
      })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith("Setup post-success side effect failed", expect.objectContaining({
        requestId: "req_test",
        step: "post_success_side_effects",
      }));
    } finally {
      warn.mockRestore();
    }
  });

  it("initialize route returns a JSON setup error with request ID on failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await app.request(
        "/api/v1/bootstrap/initialize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        { ENVIRONMENT: "test" } as Env,
      );
      const body = await response.json() as {
        success: boolean;
        message: string;
        requestId: string;
        request_id: string;
        error: {
          code: string;
          title: string;
          message: string;
          requestId: string;
          step: string;
          status: number;
          retryable: boolean;
          details?: { step: string };
        };
      };

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.message).toBe("Some of the provided information is not valid. Please review the form and try again.");
      expect(body.requestId).toMatch(/^req_/);
      expect(body.request_id).toBe(body.requestId);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.requestId).toBe(body.requestId);
      expect(body.error.title).toBe("Please review the form");
      expect(body.error.step).toBe("validate_payload");
      expect(body.error.status).toBe(400);
      expect(body.error.retryable).toBe(false);
      expect(body.error.details?.step).toBe("validate_payload");
      expect(response.headers.get("x-request-id")).toBe(body.requestId);
    } finally {
      error.mockRestore();
    }
  });

  it("partially initialized setup retry is handled safely without duplicate writes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let coreWriteCount = 0;
    const env = {
      ENVIRONMENT: "test",
      BOOTSTRAP_ADMIN_TOKEN: "bootstrap-token",
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            first: async () => {
              if (sql.includes("FROM companies")) return { total: 1 };
              return { total: 0 };
            },
            run: async () => {
              if (!sql.includes("system_bootstrap")) {
                coreWriteCount += 1;
              }
              return { success: true };
            },
          }),
        }),
        batch: async () => {
          coreWriteCount += 1;
          return [];
        },
      },
    } as unknown as Env;

    try {
      const response = await app.request(
        "/api/v1/bootstrap/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer bootstrap-token",
          },
          body: JSON.stringify({
            company: { company_name: "Cafe Asiana" },
            super_admin: {
              full_name: "Ahmed Naish",
              email: "admin@example.com",
              password: "StrongPassword123!",
            },
          }),
        },
        env,
      );
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(409);
      expect(body.error.code).toBe("BOOTSTRAP_ALREADY_COMPLETED");
      expect(coreWriteCount).toBe(0);
    } finally {
      error.mockRestore();
    }
  });
});

describe("bootstrap integration placeholders", () => {
  it.todo("status returns setup_required true when no users and no company exist");
  it.todo("status returns setup_required false after any user exists");
  it.todo("status response does not expose counts, emails, role details, or secrets");
  it.todo("initialize fails without Authorization header");
  it.todo("initialize fails with wrong token");
  it.todo("initialize fails if BOOTSTRAP_ADMIN_TOKEN is missing");
  it.todo("initialize does not log bootstrap token");
  it.todo("outlet_code uniqueness is checked if provided");
  it.todo("creates company when none exists");
  it.todo("creates first outlet if provided");
  it.todo("creates first Super Admin user");
  it.todo("assigns Super Admin role");
  it.todo("hashes password and does not store plaintext password");
  it.todo("creates high-severity audit log");
  it.todo("ensures company, feature, approval, leave, and document defaults");
  it.todo("response omits password_hash, salt, tokens, TOTP secrets, and backup codes");
  it.todo("cannot run again after first user exists");
  it.todo("fails if Super Admin role is missing");
  it.todo("does not create a usable user without role assignment");
  it.todo("audit failure fails bootstrap");
  it.todo("device auth cannot access bootstrap initialize without bootstrap token");
  it.todo("normal auth is not required for initialize");
});
