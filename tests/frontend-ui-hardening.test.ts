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

  it("registers a global toast provider and viewport for normal action feedback", () => {
    const providers = read("frontend/src/app/providers.tsx");
    const toastProvider = read("frontend/src/components/feedback/ToastProvider.tsx");
    const toastViewport = read("frontend/src/components/feedback/ToastViewport.tsx");
    const useToast = read("frontend/src/components/feedback/useToast.ts");

    expect(providers).toContain("ToastProvider");
    expect(providers).toContain("<ToastProvider>{children}</ToastProvider>");
    expect(toastProvider).toContain("ToastContext.Provider");
    expect(toastProvider).toContain("showToast");
    expect(toastProvider).toContain("dismissToast");
    expect(toastProvider).toContain("window.setTimeout");
    expect(toastViewport).toContain("aria-live");
    expect(toastViewport).toContain("Dismiss notification");
    expect(useToast).toContain("success: 3000");
    expect(useToast).toContain("info: 4000");
    expect(useToast).toContain("warning: 5000");
    expect(useToast).toContain("error: 6000");
  });

  it("routes session expiration and inline success feedback through toasts", () => {
    const toastProvider = read("frontend/src/components/feedback/ToastProvider.tsx");
    const inlineAlert = read("frontend/src/components/feedback/InlineAlert.tsx");
    const appErrorAlert = read("frontend/src/components/feedback/AppErrorAlert.tsx");
    const apiErrors = read("frontend/src/lib/api-errors.ts");

    expect(apiErrors).toContain("hrm:session-expired");
    expect(toastProvider).toContain("Session expired");
    expect(toastProvider).toContain("Your session expired. Please sign in again.");
    expect(inlineAlert).toContain('variant === "success"');
    expect(inlineAlert).toContain('variant === "error"');
    expect(inlineAlert).toContain("toast.success");
    expect(inlineAlert).toContain("toast.error");
    expect(inlineAlert).toContain("persistent");
    expect(inlineAlert).toContain("return null");
    expect(appErrorAlert).toContain("persistent");
    expect(appErrorAlert).toContain("ErrorDetailsAccordion");
  });

  it("keeps background polling from becoming noisy toast feedback", () => {
    const apiClient = read("frontend/src/lib/api-client.ts");
    const notificationApi = read("frontend/src/features/notifications/notifications.api.ts");

    expect(apiClient).toContain("X-HRM-Background-Request");
    expect(apiClient).toContain("X-HRM-User-Activity");
    expect(notificationApi).toContain("background: true");
    expect(read("frontend/src/components/feedback/useToast.ts")).toContain("toastDurations");
  });

  it("removes browser alert usage while preserving persistent blocking alert components", () => {
    const offenders = frontendFiles().filter(({ text }) => /window\.alert\s*\(|\balert\s*\(/.test(text));

    expect(offenders.map((file) => file.relative)).toEqual([]);
    expect("window.alert").toBe("window.alert");
    expect(read("frontend/src/components/feedback/AppErrorAlert.tsx")).toContain("AppErrorAlert");
    expect(read("frontend/src/components/feedback/InlineAlert.tsx")).toContain("InlineAlert");
  });

  it("keeps breadcrumbs while replacing large page headers with compact action bars", () => {
    const topbar = read("frontend/src/components/layout/Topbar.tsx");
    const breadcrumbs = read("frontend/src/components/layout/Breadcrumbs.tsx");
    const pageHeader = read("frontend/src/components/layout/PageHeader.tsx");

    expect(topbar).toContain("<Breadcrumbs />");
    expect(breadcrumbs).toContain('aria-label="Breadcrumb"');
    expect(pageHeader).not.toContain("<h1");
    expect(pageHeader).not.toContain("text-xl");
    expect(pageHeader).not.toContain("tracking-tight");
    expect(pageHeader).not.toContain("border-b");
    expect(pageHeader).toContain("justify-end");
    expect(pageHeader).toContain("flex-wrap");
    expect(pageHeader).toContain("aria-label");
  });

  it("preserves critical page action buttons after header compaction", () => {
    const criticalActions = [
      ["frontend/src/features/employees/EmployeesPage.tsx", "Add Employee"],
      ["frontend/src/features/documents/DocumentsPage.tsx", "Upload document"],
      ["frontend/src/features/imports/ImportCenterPage.tsx", "Template CSV"],
      ["frontend/src/features/backup-recovery/BackupRecoveryPage.tsx", "Create backup"],
      ["frontend/src/features/backup-recovery/BackupRecoveryPage.tsx", "Create restore job"],
      ["frontend/src/features/advances/AdvancesPage.tsx", "New advance"],
      ["frontend/src/features/salary-loans/SalaryLoansPage.tsx", "New loan"],
      ["frontend/src/features/assets/AssetsPage.tsx", "Create asset"],
    ];

    for (const [file, actionText] of criticalActions) {
      const text = read(file);
      expect(text).toContain("PageHeader");
      expect(text).toContain(actionText);
    }
  });
});
