import { describe, expect, it } from "vitest";

import { EXPORT_FORMATS, IMPORT_EXPORT_MESSAGES, IMPORT_TYPES } from "../src/modules/import-export/import-export.constants";
import { getTemplate, listTemplates } from "../src/modules/import-export/import-template.service";
import { validateExportCreate, validateImportUpload } from "../src/modules/import-export/import-export.validators";
import { AppError, ValidationError } from "../src/utils/errors";

describe("import/export foundation", () => {
  it("supports Excel and PDF export formats only", () => {
    expect(EXPORT_FORMATS).toEqual(["xlsx", "pdf"]);
  });

  it("validates export requests", () => {
    expect(validateExportCreate({ export_type: "employees", format: "xlsx" }).format).toBe("xlsx");
    expect(validateExportCreate({ export_type: "employees", format: "pdf" }).format).toBe("pdf");
    expect(() => validateExportCreate({ export_type: "employees", format: "csv" })).toThrow(AppError);
    expect(() => validateExportCreate({ export_type: "unknown", format: "xlsx" })).toThrow(AppError);
  });

  it("validates import uploads", () => {
    expect(IMPORT_TYPES).toContain("employees");
    expect(validateImportUpload({
      import_type: "employees",
      file_type: "xlsx",
      file_name: "employees.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_base64: "bmFtZQpBaG1lZA==",
      reason: "Importing employees",
    }).file_name).toBe("employees.xlsx");
    expect(() => validateImportUpload({
      import_type: "employees",
      file_type: "xlsx",
      mime_type: "application/pdf",
      content_base64: "x",
      reason: "Testing invalid mime",
    })).toThrow(ValidationError);
  });

  it("normalizes supported Prompt 15 import aliases", () => {
    expect(validateImportUpload({
      import_type: "attendance",
      file_type: "xlsx",
      file_name: "attendance.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

  it("uses a truthful unavailable message for import apply when no safe writer exists", () => {
    expect(IMPORT_EXPORT_MESSAGES.applyNotConfigured).toBe("Excel import apply is not configured for this template yet.");
    expect(IMPORT_EXPORT_MESSAGES.applied).toBe("Import applied successfully.");
  });
});


