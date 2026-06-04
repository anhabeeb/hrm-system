import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("two-factor frontend integration", () => {
  it("renders QR setup, manual key, and copy support on the Security page component", () => {
    const source = readFileSync("frontend/src/features/profile/TwoFactorManagement.tsx", "utf8");

    expect(source).toContain('import QRCode from "qrcode"');
    expect(source).toContain("QRCode.toDataURL");
    expect(source).toContain("setupData.otpauth_url");
    expect(source).toContain("setupData.manual_key ?? setupData.manual_setup_key");
    expect(source).toContain("Copy key");
    expect(source).toContain("navigator.clipboard?.writeText");
    expect(source).toContain("Scan this QR code");
    expect(source).not.toContain("secret_encrypted");
  });

  it("uses the new profile 2FA endpoints for status, setup, confirmation, and disable", () => {
    const source = readFileSync("frontend/src/features/profile/profile.api.ts", "utf8");

    expect(source).toContain('twoFactorStatus: () => api.get<SecuritySummary>("/me/2fa/status")');
    expect(source).toContain('setupTwoFactor: () => api.post<TwoFactorSetupResponse>("/me/2fa/setup")');
    expect(source).toContain('verifyTwoFactor: (code: string) => api.post<TwoFactorVerifyResponse>("/me/2fa/confirm"');
    expect(source).toContain('disableTwoFactor: (input: { password?: string; code?: string })');
  });

  it("handles login-time two-factor challenges without persisting credentials", () => {
    const storeSource = readFileSync("frontend/src/features/auth/auth.store.tsx", "utf8");
    const apiSource = readFileSync("frontend/src/features/auth/api.ts", "utf8");

    expect(apiSource).toContain('api.post<LoginResult>("/auth/2fa/verify"');
    expect(storeSource).toContain("TWO_FACTOR_REQUIRED");
    expect(storeSource).toContain("challenge_id");
    expect(storeSource).toContain("authApi.verifyLoginTwoFactor");
    expect(storeSource).not.toContain("localStorage.setItem(\"pendingTwoFactor");
    expect(storeSource).not.toContain("sessionStorage.setItem(\"pendingTwoFactor");
  });
});
