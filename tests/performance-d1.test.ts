import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateAttendanceReportFilters } from "../src/modules/attendance/attendance-reports.validators";
import { validateHrReportFilters } from "../src/modules/hr-reports/hr-reports.validators";
import { validatePayrollReportFilters } from "../src/modules/payroll-reports/payroll-reports.validators";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const heavyFeatureModules = [
  "users/UsersAccessPage",
  "outlets/OutletsPage",
  "departments/DepartmentsPage",
  "positions/PositionsPage",
  "employees/EmployeesPage",
  "employees/Employee360Page",
  "contracts/ContractsPage",
  "offboarding/OffboardingPage",
  "attendance/AttendancePage",
  "attendance/AttendanceCorrectionsPage",
  "attendance/AttendanceReportsPage",
  "rosters/RostersPage",
  "devices/KioskDevicesPage",
  "sync/SyncStatusPage",
  "biometric/BiometricPage",
  "leave/LeavePage",
  "holidays/HolidayCalendarPage",
  "long-leave/LongLeavePage",
  "payroll/PayrollPage",
  "payslips/PayslipsPage",
  "advances/AdvancesPage",
  "salary-loans/SalaryLoansPage",
  "assets/AssetsPage",
  "uniforms/UniformsPage",
  "documents/DocumentsPage",
  "approvals/ApprovalsPage",
  "reports/ReportsPage",
  "hr-reports/HrReportsPage",
  "payroll-reports/PayrollReportsPage",
  "report-exports/ExportHistoryPage",
  "report-exports/ReportPrintPage",
  "import-export/ImportExportPage",
  "imports/ImportCenterPage",
  "backup-recovery/BackupRecoveryPage",
  "data-retention/DataRetentionPage",
  "settings/SettingsPage",
  "settings/company/CompanyInformationPage",
  "settings/security/SecuritySettingsPage",
  "settings/attendance/AttendanceSettingsPage",
  "settings/leave/LeaveSettingsPage",
  "settings/payroll/PayrollSettingsPage",
  "settings/documents/DocumentsSettingsPage",
  "settings/backup/BackupSettingsPage",
  "settings/notifications/NotificationsSettingsPage",
  "settings/reports/ReportsSettingsPage",
  "settings/import-export/ImportExportSettingsPage",
  "settings/devices-sync/DevicesSyncSettingsPage",
  "audit/AuditLogsPage",
  "profile-update-requests/ProfileUpdateRequestsPage",
  "notifications/NotificationsPage",
  "expiry-alerts/ExpiryAlertsPage",
];

describe("Phase 13D performance and D1 optimization", () => {
  it("lazy-loads heavy frontend routes instead of importing them into the main bundle", () => {
    const router = read("frontend/src/app/router.tsx");

    expect(router).toContain("lazyNamed");
    expect(router).toContain("<Suspense fallback={routeFallback}>");

    for (const modulePath of heavyFeatureModules) {
      expect(router).toContain(`import("@/features/${modulePath}")`);
      expect(router).not.toContain(`from "@/features/${modulePath}"`);
    }
  });

  it("keeps core auth/setup routes eager while guarded lazy routes still use ModuleRoute", () => {
    const router = read("frontend/src/app/router.tsx");

    for (const coreModule of [
      "auth/LoginPage",
      "auth/TwoFactorPage",
      "auth/ForgotPasswordPage",
      "auth/ResetPasswordPage",
      "bootstrap/FirstTimeSetupPage",
      "bootstrap/FirstTimeSetupPlaceholder",
      "dashboard/DashboardPage",
    ]) {
      expect(router).toContain(`from "@/features/${coreModule}"`);
    }

    expect(router).toContain("const guarded = (");
    expect(router).toContain("<ModuleRoute");
    expect(router).toContain('path="/employees" element={guarded(<EmployeesPage />');
    expect(router).toContain('path="/payroll" element={guarded(<PayrollPage />');
    expect(router).toContain('path="/backup-recovery" element={guarded(<BackupRecoveryPage />');
  });

  it("caps high-risk report page sizes and requires attendance report date bounds", () => {
    expect(validateHrReportFilters({ page_size: "500" }).page_size).toBe(100);
    expect(validatePayrollReportFilters({ page_size: "500" }).page_size).toBe(100);

    expect(() => validateAttendanceReportFilters({}, "daily")).toThrow("requires a bounded date range");
    expect(() => validateAttendanceReportFilters({ date: "2026-06-09", page_size: "500" }, "daily")).toThrow("less than or equal to 100");
    expect(validateAttendanceReportFilters({ date: "2026-06-09", page_size: "100" }, "daily").page_size).toBe(100);
  });

  it("allowlists report sort fields and drops unsafe sort input", () => {
    expect(validateHrReportFilters({ sort_by: "employee_code" }).sort_by).toBe("employee_code");
    expect(validateHrReportFilters({ sort_by: "employee_code; DROP TABLE employees" }).sort_by).toBeUndefined();
    expect(validatePayrollReportFilters({ sort_by: "gross_salary" }).sort_by).toBe("gross_salary");
    expect(validatePayrollReportFilters({ sort_by: "gross_salary DESC, password_hash" }).sort_by).toBeUndefined();
  });

  it("adds focused performance indexes for real high-traffic D1 query patterns", () => {
    const migration = read("migrations/0054_performance_d1_indexes.sql");

    for (const index of [
      "idx_perf_attendance_summary_company_date",
      "idx_perf_roster_shifts_company_employee_date",
      "idx_perf_roster_shifts_company_outlet_date",
      "idx_perf_roster_conflicts_company_status_created",
      "idx_perf_biometric_devices_company_status_seen",
      "idx_perf_leave_requests_company_status_dates",
      "idx_perf_long_leave_records_company_status_dates",
    ]) {
      expect(migration).toContain(index);
    }
  });

  it("keeps list/report repositories company-scoped and bounded", () => {
    for (const file of [
      "src/modules/attendance/attendance-reports.repository.ts",
      "src/modules/hr-reports/hr-reports.repository.ts",
      "src/modules/payroll-reports/payroll-reports.repository.ts",
      "src/modules/imports/imports.repository.ts",
      "src/modules/backup-recovery/backup-recovery.repository.ts",
      "src/modules/data-retention/data-retention.repository.ts",
      "src/modules/expiry-alerts/expiry-alerts.repository.ts",
    ]) {
      const source = read(file);
      expect(source).toMatch(/company_id\s*=/);
      expect(source).toMatch(/LIMIT \? OFFSET \?|LIMIT 500|LIMIT 5000|LIMIT \?`/);
    }
  });

  it("documents the performance audit and exposes a verifier script", () => {
    const packageJson = read("package.json");
    const docs = read("docs/performance-d1-audit.md");
    const scripts = readdirSync(resolve(process.cwd(), "scripts"));

    expect(packageJson).toContain("verify:performance-d1");
    expect(scripts).toContain("verify-performance-d1.mjs");
    expect(docs).toContain("High-Traffic Endpoints Reviewed");
    expect(docs).toContain("Frontend Lazy Loading");
    expect(docs).toContain("Indexes Added");
  });
});
