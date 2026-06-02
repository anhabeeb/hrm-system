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

describe("import/export integration placeholders", () => {
  it.todo("export jobs store files in BACKUP_BUCKET and never expose file_key in API JSON");
  it.todo("sensitive exports require reason and create audit logs");
  it.todo("import validation writes row counts without applying business data");
  it.todo("import apply remains a safe placeholder until module-specific importers are implemented");
  it.todo("device-authenticated callers cannot access import/export routes");
  it.todo("GET /import-export/templates/:templateKey exists and returns NOT_FOUND for invalid keys");
  it.todo("import upload without reason is rejected before writing R2 or metadata");
  it.todo("invalid base64 is rejected before writing R2 or metadata");
  it.todo("sensitive export requires reason and export.sensitive or Super Admin");
  it.todo("payroll export requires payroll.view and export permission");
  it.todo("audit_activity export requires audit permission");
  it.todo("outlet-limited users cannot create or download company-wide exports");
  it.todo("documents_metadata export masks sensitive file names and never includes file_key");
  it.todo("outlet-limited requester can access their own outlet-scoped export");
  it.todo("outlet-limited non-requester cannot access the same outlet export");
  it.todo("outlet-limited user cannot access company-wide export");
  it.todo("outlet-limited user cannot access own export after outlet access is removed");
  it.todo("malformed filters_json blocks outlet-limited user");
  it.todo("export detail/download return EXPORT_ACCESS_DENIED for inaccessible export jobs");
  it.todo("apply placeholder returns applied false and placeholder message");
  it.todo("Import applied successfully is only used when applied true");
  it.todo("outlet-limited user can cancel own outlet-scoped queued export");
  it.todo("outlet-limited user cannot cancel another user's export in the same outlet");
  it.todo("outlet-limited user cannot retry another user's export in the same outlet");
  it.todo("outlet-limited user cannot cancel or retry company-wide export");
  it.todo("Super Admin can cancel company-wide queued export");
  it.todo("Super Admin can retry company-wide failed export");
  it.todo("malformed filters_json blocks outlet-limited cancel and retry");
  it.todo("queued and processing exports can be cancelled");
  it.todo("completed, failed, and cancelled exports cannot be cancelled");
  it.todo("failed exports can be retried");
  it.todo("queued, processing, completed, and cancelled exports cannot be retried");
  it.todo("blocked cancel/retry does not change status or create audit log");
  it.todo("cancel/retry responses do not include file_key");
});
