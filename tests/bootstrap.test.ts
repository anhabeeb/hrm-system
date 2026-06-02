import { describe, expect, it, vi } from "vitest";

import { BOOTSTRAP_MESSAGES, DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../src/modules/bootstrap/bootstrap.constants";
import { cloneCompanyDefaults, ensureCompanySuperAdminRole } from "../src/modules/bootstrap/bootstrap.repository";
import { isStrongBootstrapPassword, validateBootstrapInitialize } from "../src/modules/bootstrap/bootstrap.validators";
import { ValidationError } from "../src/utils/errors";

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
