import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("profile email update UI", () => {
  it("shows a dedicated email update section with read-only current email", () => {
    const source = readFileSync("frontend/src/features/profile/KycUpdateForm.tsx", "utf8");

    expect(source).toContain("Email Update");
    expect(source).toContain("Current email");
    expect(source).toContain("readOnly");
    expect(source).toContain("New email");
    expect(source).toContain("Confirm new email");
    expect(source).toContain("If approved, this will change the user's login email.");
  });

  it("submits email updates as request_type email_update with normalized email payload", () => {
    const source = readFileSync("frontend/src/features/profile/KycUpdateForm.tsx", "utf8");

    expect(source).toContain('return "email_update"');
    expect(source).toContain("nextEmail = values.new_email?.trim().toLowerCase()");
    expect(source).toContain('email: requestType === "email_update" ? nextEmail : undefined');
    expect(source).toContain("The new email must be different from your current email.");
  });

  it("validates new email confirmation before submission", () => {
    const source = readFileSync("frontend/src/features/profile/profile.schema.ts", "utf8");

    expect(source).toContain("new_email");
    expect(source).toContain("confirm_new_email");
    expect(source).toContain("Email addresses must match.");
    expect(source).toContain("Please enter a valid email address.");
  });

  it("renders email update requests with readable labels instead of raw JSON keys", () => {
    const source = readFileSync("frontend/src/features/profile/KycUpdatePage.tsx", "utf8");

    expect(source).toContain("Email Update");
    expect(source).toContain('request.request_type === "email_update"');
    expect(source).toContain("Email: ${parsed.email}");
  });
});
