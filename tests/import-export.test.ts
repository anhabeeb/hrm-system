import { describe, expect, it } from "vitest";

import { toCsv } from "../src/modules/import-export/csv.service";
import { EXPORT_FORMATS, IMPORT_EXPORT_MESSAGES, IMPORT_TYPES } from "../src/modules/import-export/import-export.constants";
import { getTemplate, listTemplates } from "../src/modules/import-export/import-template.service";
import { validateExportCreate, validateImportUpload } from "../src/modules/import-export/import-export.validators";
import { toSafeJson } from "../src/modules/import-export/json-export.service";
import { AppError, ValidationError } from "../src/utils/errors";

describe("import/export foundation", () => {
  it("supports safe JSON and CSV export formats", () => {
    expect(EXPORT_FORMATS).toEqual(["json", "csv"]);
    expect(toCsv([{ name: "Ahmed", note: "a,b" }])).toContain('"a,b"');
  });

  it("masks sensitive fields in JSON exports", () => {
    const body = toSafeJson({ rows: [{ employee_name: "Ahmed", passport_number: "A123" }] });
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain("A123");
  });

  it("validates export requests", () => {
    expect(validateExportCreate({ export_type: "employees", format: "json" }).export_type).toBe("employees");
    expect(() => validateExportCreate({ export_type: "unknown", format: "xlsx" })).toThrow(AppError);
  });

  it("validates import uploads", () => {
    expect(IMPORT_TYPES).toContain("employees");
    expect(validateImportUpload({
      import_type: "employees",
      file_name: "employees.csv",
      mime_type: "text/csv",
      content_base64: "bmFtZQpBaG1lZA==",
      reason: "Importing employees",
    }).file_name).toBe("employees.csv");
    expect(() => validateImportUpload({
      import_type: "employees",
      mime_type: "application/pdf",
      content_base64: "x",
      reason: "Testing invalid mime",
    })).toThrow(ValidationError);
  });

  it("normalizes supported Prompt 15 import aliases", () => {
    expect(validateImportUpload({
      import_type: "attendance",
      file_name: "attendance.csv",
      mime_type: "text/csv",
      content_base64: "YQ==",
      reason: "Manual attendance import",
    }).import_type).toBe("attendance_manual");
  });

  it("lists and loads Prompt 15 import templates", () => {
    expect(listTemplates().templates.map((template) => template.import_type)).toEqual(expect.arrayContaining([
      "employees",
      "attendance_manual",
      "leave_balances",
      "assets",
      "uniforms",
      "documents_metadata",
    ]));
    expect(getTemplate("attendance_manual").template.import_type).toBe("attendance_manual");
  });

  it("uses a truthful placeholder message for safe import apply", () => {
    expect(IMPORT_EXPORT_MESSAGES.applyPlaceholder).toBe("Import validation completed. Applying imports will be implemented in a later step.");
    expect(IMPORT_EXPORT_MESSAGES.applied).toBe("Import applied successfully.");
  });
});


