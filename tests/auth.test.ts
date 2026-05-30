import { describe, expect, it } from "vitest";

import { validateKycUpdateRequestInput } from "../src/modules/auth/auth.validators";
import { hashPassword, verifyPassword } from "../src/services/password.service";
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
