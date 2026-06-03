import { describe, expect, it } from "vitest";

import { toSafeJson } from "../src/modules/import-export/json-export.service";
import { maskSensitiveValue } from "../src/modules/reports/report-permission.service";
import { sanitizeSensitivePayload } from "../src/utils/sanitize";

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

describe("security hardening placeholders", () => {
  it.todo("login responses never expose password_hash, reset token, TOTP secret, backup codes, or session token internals");
  it.todo("bootstrap initialize response omits password_hash, tokens, BOOTSTRAP_ADMIN_TOKEN, and auth internals");
  it.todo("user and employee responses mask passport, ID card, bank details, and salary fields unless specifically permitted");
  it.todo("document/export/backup APIs never expose R2 file_key or storage_location in JSON responses");
  it.todo("sensitive document file names are masked without documents.view_sensitive");
  it.todo("realtime events exclude salary amounts, sensitive approval payloads, file_key, tokens, and secrets");
  it.todo("file download errors remain standard JSON and do not include private R2 object keys");
});
