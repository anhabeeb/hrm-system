import { describe, expect, it } from "vitest";

import { validateKycUpdateRequestInput } from "../src/modules/auth/auth.validators";
import { PASSWORD_HASH_ALGORITHM, PASSWORD_HASH_VERSION, PBKDF2_MAX_WORKERS_ITERATIONS } from "../src/modules/auth/auth.constants";
import { hashPassword, passwordNeedsRehash, resolvePasswordHashConfig, verifyPassword } from "../src/services/password.service";
import { ValidationError } from "../src/utils/errors";

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

describe.todo("auth integration", () => {
  it.todo("login rejects a wrong password with a generic message");
  it.todo("login requires 2FA when TOTP is enabled");
  it.todo("forgot password does not reveal whether an email exists");
  it.todo("password reset tokens are stored only as hashes");
  it.todo("session tokens are stored only as hashes");
  it.todo("/me never returns password_hash or token hash fields");
});
