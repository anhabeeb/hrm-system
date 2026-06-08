import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const frontendSrc = resolve(root, "frontend/src");

const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return listSourceFiles(full);
      return /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });

const frontendFiles = () =>
  listSourceFiles(frontendSrc).map((file) => ({
    absolute: file,
    relative: relative(root, file).replace(/\\/g, "/"),
    text: readFileSync(file, "utf8"),
  }));

describe("frontend completed-phase hardening coverage", () => {
  it("error diagnostics use friendly sanitized messages instead of raw operational details", () => {
    const safeDisplay = read("frontend/src/lib/safe-display.ts");
    const apiErrors = read("frontend/src/lib/api-errors.ts");
    const errorBoundary = read("frontend/src/components/feedback/AppErrorBoundary.tsx");

    expect(safeDisplay).toContain("sanitizeForDisplay");
    expect(safeDisplay).toContain("file_key");
    expect(safeDisplay).toContain("[redacted]");
    expect(safeDisplay).toContain("You do not have permission to perform this action.");
    expect(safeDisplay).toContain("This attendance record affects a locked payroll period.");
    expect(apiErrors).toContain("ApiError");
    expect(errorBoundary).toContain("Something went wrong");
    expect(errorBoundary).not.toContain("error.stack");
  });

  it("selectors use the permission-aware lookup endpoints rather than direct business APIs", () => {
    const lookupApi = read("frontend/src/components/selectors/lookup-api.ts");
    const selectors = read("frontend/src/components/selectors/index.tsx");

    for (const path of [
      "/lookups/employees",
      "/lookups/outlets",
      "/lookups/departments",
      "/lookups/positions",
      "/lookups/leave-types",
      "/lookups/payroll-periods",
    ]) {
      expect(lookupApi).toContain(path);
    }

    expect(selectors).toContain("lookupApi.employees");
    expect(selectors).toContain("lookupApi.payrollPeriods");
    expect(selectors).not.toContain("/employees?");
    expect(selectors).not.toContain("/payroll?");
  });

  it("router and navigation guard leave payroll documents approvals reports imports exports and backup pages", () => {
    const router = read("frontend/src/app/router.tsx");
    const navigation = read("frontend/src/lib/navigation.ts");

    const guardedRoutes = [
      ['path="/leave"', 'permission: "leave.view"'],
      ['path="/payroll"', 'permission: "payroll.view"'],
      ['path="/documents"', 'permission: "documents.view"'],
      ['path="/approvals"', 'permission: "approvals.view"'],
      ['path="/payroll-reports"', 'payroll_reports.view'],
      ['path="/report-exports"', 'report_exports.history.view'],
      ['path="/imports"', 'imports.view'],
      ['path="/backup-recovery"', 'backup.view'],
      ['path="/data-retention"', 'data_retention.view'],
    ];

    for (const [route, permission] of guardedRoutes) {
      expect(router).toContain(route);
      expect(router).toContain(permission);
      expect(navigation).toContain(permission.replace('permission: "', "").replace('"', ""));
    }
  });

  it("hidden unauthorized tabs do not enable protected API queries", () => {
    const reportsPage = read("frontend/src/features/reports/ReportsPage.tsx");
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    const importExportPage = read("frontend/src/features/import-export/ImportExportPage.tsx");

    expect(reportsPage).toContain('enabled: activeTab === "payroll" && canPayroll');
    expect(reportsPage).toContain('enabled: activeTab === "compliance" && canViewDocumentSummaryReport');
    expect(reportsPage).toContain('enabled: activeTab === "audit" && canAudit');
    expect(reportsPage).toContain('{canPayroll ? <TabsTrigger value="payroll">Payroll</TabsTrigger> : null}');

    expect(approvalsPage).toContain('enabled: activeTab === "inbox" && canViewInbox');
    expect(approvalsPage).toContain('enabled: activeTab === "workflows" && canViewWorkflows');
    expect(approvalsPage).toContain('enabled: activeTab === "thresholds" && canViewThresholds');

    expect(importExportPage).toContain('enabled: activeTab === "imports" && canViewImports');
    expect(importExportPage).toContain('canViewExports ? <TabsTrigger value="exports">Exports</TabsTrigger> : null');
    expect(importExportPage).toContain('canViewImports ? <TabsTrigger value="imports">Imports</TabsTrigger> : null');
  });

  it("sensitive raw metadata keys are sanitized before display and not rendered as normal columns", () => {
    const files = frontendFiles();
    const unsafeColumnFiles = files.filter(({ relative: file, text }) => {
      if (file.endsWith("safe-display.ts")) return false;
      return /(header|label|title):\s*["'`](file_key|token|secret|password_hash|password|api_key)["'`]/i.test(text);
    });

    expect(unsafeColumnFiles.map((file) => file.relative)).toEqual([]);

    const safeDisplay = read("frontend/src/lib/safe-display.ts");
    for (const key of ["token", "secret", "password", "hash", "api_key", "file_key", "biometric_template"]) {
      expect(safeDisplay).toContain(key);
    }
  });

  it("does not add dark mode or a theme switcher to the light admin UI", () => {
    const offenders = frontendFiles().filter(({ relative: file, text }) => {
      if (file.endsWith("frontend-ui-hardening.test.ts")) return false;
      return /\bdark:\b|ThemeSwitcher|theme\s*=\s*["'`]dark["'`]|setTheme\(["'`]dark["'`]\)/.test(text);
    });

    expect(offenders.map((file) => file.relative)).toEqual([]);
  });
});
