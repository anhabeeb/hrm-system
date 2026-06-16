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
    expect(IMPORT_TYPES).toEqual(["employees"]);
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

  it("rejects unsupported import templates instead of showing fake completed imports", () => {
    expect(() => validateImportUpload({
      import_type: "attendance",
      file_type: "xlsx",
      file_name: "attendance.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_base64: "YQ==",
      reason: "Manual attendance import",
    })).toThrow("Please select a valid import type.");
  });

  it("lists only available Excel import templates", () => {
    expect(listTemplates().templates.map((template) => template.import_type)).toEqual(["employees"]);
    expect(getTemplate("employees").template).toMatchObject({
      import_type: "employees",
      format: "xlsx",
      status: "available",
    });
    expect(() => getTemplate("attendance_manual")).toThrow(AppError);
  });

  it("keeps user-facing import apply messaging for the implemented Excel path", () => {
    expect(IMPORT_EXPORT_MESSAGES.applied).toBe("Import applied successfully.");
  });
});


