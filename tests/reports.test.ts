import { describe, expect, it } from "vitest";

import { REPORT_DEFINITIONS } from "../src/modules/reports/reports.constants";
import { maskSensitiveValue } from "../src/modules/reports/report-permission.service";
import { validateGenerateReport, validateReportFilters } from "../src/modules/reports/reports.validators";
import { ValidationError } from "../src/utils/errors";

describe("reports foundation", () => {
  it("exposes the expected report catalog keys", () => {
    expect(REPORT_DEFINITIONS.map((report) => report.report_key)).toEqual(expect.arrayContaining([
      "employee_summary",
      "attendance_summary",
      "leave_summary",
      "payroll_summary",
      "expiring_documents",
      "audit_activity",
    ]));
  });

  it("masks sensitive values recursively", () => {
    const masked = maskSensitiveValue({
      password_hash: "secret",
      profile: { bank_account_number: "123", employee_name: "Ahmed" },
    }) as Record<string, unknown>;

    expect(masked.password_hash).toBe("[REDACTED]");
    expect(masked.profile).toEqual({ bank_account_number: "[REDACTED]", employee_name: "Ahmed" });
  });

  it("validates report generation input", () => {
    expect(validateGenerateReport({ report_key: "employee_summary", format: "json" }).report_key).toBe("employee_summary");
    expect(() => validateGenerateReport({ report_key: "", format: "pdf" })).toThrow(ValidationError);
  });

  it("normalizes supported report filters", () => {
    const filters = validateReportFilters({ days: "0", payroll_month: "2026-06", page: "2", page_size: "50" });
    expect(filters.days).toBe(1);
    expect(filters.payroll_month).toBe("2026-06");
    expect(filters.page).toBe(2);
    expect(filters.page_size).toBe(50);
  });
});

describe("reports integration placeholders", () => {
  it.todo("dashboard summary applies outlet access filtering");
  it.todo("payroll reports do not expose salary data without payroll permission");
  it.todo("document compliance reports never expose raw R2 file keys");
  it.todo("audit activity report masks sensitive old/new values");
  it.todo("device-authenticated callers cannot access report routes");
  it.todo("exportable reports create audit logs when sensitive data is generated");
  it.todo("user with payroll.view but without reports.view cannot access payroll summary report");
  it.todo("user with reports.view but without payroll.view cannot access payroll summary report");
  it.todo("user with both reports.view and payroll.view can access payroll summary report");
  it.todo("asset, document, audit, device health, sync status, and dashboard reports are outlet-filtered");
  it.todo("sensitive expiring document file_name is masked without documents.view_sensitive");
  it.todo("document reports never include file_key");
  it.todo("missing documents report uses real document category applicability");
  it.todo("missing documents report respects foreign/local employee applicability");
  it.todo("missing documents report is outlet-filtered and paginated");
  it.todo("missing documents report never returns file_key or placeholder note");
  it.todo("asset summary includes status counts, pending returns, deductions, by_outlet, and by_asset_type");
  it.todo("document summary includes missing_required_count from real missing-document logic");
});
