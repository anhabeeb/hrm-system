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
    expect(validateGenerateReport({ report_key: "employee_summary", format: "xlsx" }).report_key).toBe("employee_summary");
    expect(validateGenerateReport({ report_key: "employee_summary", format: "pdf" }).format).toBe("pdf");
    expect(() => validateGenerateReport({ report_key: "employee_summary", format: "json" })).toThrow(ValidationError);
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


