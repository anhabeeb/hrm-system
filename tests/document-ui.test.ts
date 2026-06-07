import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  documentStatusOptions,
  documentTypeLabel,
  documentTypeOptions,
  drivingLicenseCategoryOptions,
} from "../frontend/src/features/documents/document-format";
import { redactSensitiveValue } from "../frontend/src/features/documents/document-sanitize";

describe("document UI helpers", () => {
  it("exposes friendly foreign employee document type labels", () => {
    expect(documentTypeOptions.map((option) => option.label)).toEqual([
      "Passport",
      "National ID",
      "Work Visa",
      "Work Permit",
      "Medical Certificate",
      "Insurance",
      "Driving License",
      "Employment Contract",
      "Contract Renewal",
      "Contract Amendment",
      "Other",
    ]);
  });

  it("exposes friendly document status labels", () => {
    expect(documentStatusOptions.map((option) => option.label)).toEqual([
      "Active",
      "Expiring Soon",
      "Expired",
      "No Expiry",
      "Replaced",
      "Archived",
      "Pending Review",
      "Rejected",
    ]);
  });

  it("shows driving license category in the document type label", () => {
    expect(documentTypeLabel({ document_type: "driving_license", driving_license_category: "light_vehicle" })).toBe("Driving License - Light Vehicle");
    expect(documentTypeLabel({ document_type: "driving_license", driving_license_category: "other", driving_license_category_other: "Forklift" })).toBe("Driving License - Forklift");
  });

  it("redacts storage internals before document data is rendered", () => {
    const redacted = redactSensitiveValue({
      id: "doc_1",
      file_key: "r2/private/key.pdf",
      r2_key: "r2/private/key.pdf",
      internal_storage_path: "private/path.pdf",
      nested: { token: "secret-token", file_key: "nested/private.pdf" },
      file_name: "permit.pdf",
    });

    expect(JSON.stringify(redacted)).not.toMatch(/file_key|r2\/private|private\/path|secret-token|nested\/private/i);
    expect(JSON.stringify(redacted)).toContain("permit.pdf");
  });

  it("has expected driving license category labels", () => {
    expect(drivingLicenseCategoryOptions.map((option) => option.label)).toEqual([
      "Motorcycle",
      "Light Vehicle",
      "Heavy Vehicle",
      "Boat",
      "Other",
    ]);
  });

  it("global document filters use selectors and friendly expiry presets", () => {
    const source = readFileSync("frontend/src/features/documents/DocumentFilters.tsx", "utf8");

    expect(source).toContain("documentTypeOptions");
    expect(source).toContain("documentStatusOptions");
    expect(source).toContain("EmployeeCombobox");
    expect(source).toContain("OutletCombobox");
    expect(source).toContain("Local");
    expect(source).toContain("Foreign");
    expect(source).toContain("Expiring within 30 days");
    expect(source).toContain("Expiring within 60 days");
    expect(source).toContain("Expiring within 90 days");
    expect(source).toContain("Expired");
  });

  it("document upload form only renders driving license category controls for driving licenses", () => {
    const source = readFileSync("frontend/src/features/documents/DocumentUploadDialog.tsx", "utf8");

    expect(source).toContain('payload.document_type === "driving_license"');
    expect(source).toContain("Driving license category");
  });

  it("global document table uses friendly labels instead of raw enum values", () => {
    const source = readFileSync("frontend/src/features/documents/DocumentsTable.tsx", "utf8");

    expect(source).toContain("documentTypeLabel");
    expect(source).toContain("validity_status");
    expect(source).not.toContain("file_key");
    expect(source).not.toContain("storage_key");
  });
});
