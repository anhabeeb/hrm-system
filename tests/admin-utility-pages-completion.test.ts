import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const walk = (dir: string): string[] => readdirSync(resolve(root, dir)).flatMap((entry) => {
  const path = `${dir}/${entry}`;
  const absolute = join(root, path);
  if (statSync(absolute).isDirectory()) return ["node_modules", "dist", "build"].includes(entry) ? [] : walk(path);
  return [path];
});

describe("admin utility pages completion", () => {
  it("Backup & Recovery uses completed command UI and inline restore confirmation", () => {
    const page = read("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx");
    const router = read("frontend/src/app/router.tsx");
    expect(router).toContain("BackupRecoveryPage");
    expect(page).toContain("Backup & Recovery");
    expect(page).toContain("Create backups, verify backup integrity, manage retention, and safely restore company data.");
    expect(page).toContain("BackupOverview");
    expect(page).toContain("Retention Policy");
    expect(page).toContain("Backup Settings");
    expect(page).toContain("Restore preview");
    expect(page).toContain("confirmDisabled");
    expect(page).toContain("RESTORE COMPANY DATA");
    expect(page).not.toContain("fixed bottom-4");
  });

  it("Import/Export exposes Excel and PDF only for new jobs", () => {
    const page = read("frontend/src/features/import-export/ImportExportPage.tsx");
    const types = read("frontend/src/features/import-export/import-export.types.ts");
    const validators = read("src/modules/import-export/import-export.validators.ts");
    const parser = read("src/modules/import-export/import-validation.service.ts");
    const service = read("src/modules/import-export/import-job.service.ts");
    const legacyImportCenter = read("frontend/src/features/imports/ImportCenterPage.tsx");
    expect(page).toContain("Excel workbook");
    expect(page).toContain("PDF report");
    expect(page).toContain("Upload an Excel file for validation before applying import changes.");
    expect(page).toContain('accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');
    expect(types).toContain('format: "xlsx" | "pdf"');
    expect(types).toContain('file_type: "xlsx"');
    expect(validators).toContain("Only Excel .xlsx import files are supported.");
    expect(parser).toContain("readZipEntries");
    expect(parser).toContain("parseWorksheet");
    expect(parser).toContain("requiredHeaders");
    expect(service).toContain("IMPORT_APPLY_NOT_CONFIGURED");
    expect(legacyImportCenter).toContain('to="/import-export"');
    expect(legacyImportCenter).not.toContain("Template CSV");
    expect(legacyImportCenter).not.toContain("csv_content");
    expect(page).not.toContain('<SelectItem value="json"');
    expect(page).not.toContain('<SelectItem value="csv"');
    expect(page).not.toContain("CSV or JSON");
  });

  it("Reports generate Excel/PDF and avoid raw JSON/CSV normal actions", () => {
    const page = read("frontend/src/features/reports/ReportsPage.tsx");
    const actions = read("frontend/src/features/report-exports/ReportExportActions.tsx");
    const reportTypes = read("frontend/src/features/reports/reports.types.ts");
    const reportValidators = read("src/modules/reports/reports.validators.ts");
    expect(page).toContain("Generate Excel");
    expect(page).toContain("Generate PDF");
    expect(page).toContain("Report outputs are generated as Excel or PDF files.");
    expect(actions).toContain("Download Excel");
    expect(actions).toContain("Download PDF");
    expect(reportTypes).toContain('format: "xlsx" | "pdf"');
    expect(reportValidators).toContain("Only Excel and PDF report exports are supported.");
    expect(page).not.toContain("Generate JSON report");
    expect(page).not.toContain("CSV/PDF/XLSX export formatting");
    expect(actions).not.toContain(">CSV<");
  });

  it("shared date picker components are used on Reports filters", () => {
    expect(read("frontend/src/components/forms/AppDatePicker.tsx")).toContain("AppDatePicker");
    expect(read("frontend/src/components/forms/AppDateRangePicker.tsx")).toContain("AppDateRangePicker");
    expect(read("frontend/src/components/forms/AppMonthPicker.tsx")).toContain("AppMonthPicker");
    const reportsPage = read("frontend/src/features/reports/ReportsPage.tsx");
    expect(reportsPage).toContain("AppDateRangePicker");
    expect(reportsPage).toContain("AppMonthPicker");
    expect(reportsPage).not.toContain('Input type="date"');
  });

  it("native browser date and month inputs are limited to shared picker internals", () => {
    const allowed = new Set([
      "frontend/src/components/forms/AppDatePicker.tsx",
      "frontend/src/components/forms/AppMonthPicker.tsx",
    ]);
    const offenders = walk("frontend/src")
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) => /type=["'](?:date|month)["']|inputType=["']date["']/.test(read(path)) && !allowed.has(path));
    expect(offenders).toEqual([]);
  });

  it("HR and payroll report tables are contained inside responsive overflow wrappers", () => {
    const dataTable = read("frontend/src/components/data/DataTable.tsx");
    const hrReports = read("frontend/src/features/hr-reports/HrReportsPage.tsx");
    const payrollReports = read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
    expect(dataTable).toContain("w-full min-w-0 space-y-3 overflow-hidden");
    expect(dataTable).toContain("w-full overflow-x-auto");
    expect(dataTable).toContain('className="min-w-max w-full"');
    expect(hrReports).toContain("lg:grid-cols-[300px_minmax(0,1fr)]");
    expect(payrollReports).toContain("lg:grid-cols-[320px_minmax(0,1fr)]");
    expect(hrReports).toContain("AppDateRangePicker");
    expect(payrollReports).toContain("AppDateRangePicker");
    expect(payrollReports).toContain("AppMonthPicker");
    expect(hrReports).not.toContain('Input type="date"');
    expect(payrollReports).not.toContain('Input type="date"');
    expect([hrReports, payrollReports].join("\n")).not.toContain("w-screen");
    expect([hrReports, payrollReports].join("\n")).not.toContain("Export-ready JSON");
  });

  it("employee avatars are available across employee-facing surfaces without forcing standalone accounts", () => {
    const avatar = read("frontend/src/components/employees/EmployeeAvatar.tsx");
    const employeeList = read("frontend/src/features/employees/EmployeeList.tsx");
    const employee360 = read("frontend/src/features/employees/Employee360Page.tsx");
    const selfService = read("frontend/src/features/self-service/SelfServiceShared.tsx");
    const accountProfile = read("frontend/src/features/profile/ProfilePage.tsx");
    const validator = read("src/modules/employees/employees.validators.ts");
    const service = read("src/modules/employees/employees.service.ts");
    const routes = read("src/routes/employees.routes.ts");
    const migration = read("migrations/0079_employee_profile_photo_metadata.sql");
    expect(avatar).toContain("EmployeeAvatar");
    expect(avatar).toContain("initialsFor");
    expect(employeeList).toContain("EmployeeAvatar");
    expect(employee360).toContain("EmployeeProfilePhotoControls");
    expect(selfService).toContain("EmployeeAvatar");
    expect(accountProfile).toContain("Standalone account · no employee photo required");
    expect(validator).toContain("image/jpeg");
    expect(validator).toContain("image/png");
    expect(validator).toContain("image/webp");
    expect(validator).toContain("maxProfilePhotoBytes");
    expect(service).toContain("DOCUMENTS_BUCKET.put");
    expect(service).toContain("profile_photo_key: _profilePhotoKey");
    expect(service).toContain("employee_profile_photo_updated");
    expect(routes).toContain("/:id/profile-photo");
    expect(migration).toContain("profile_photo_key");
    expect(migration).toContain("profile_photo_uploaded_by");
  });

  it("report and personalization changes guard against UI_RENDER_ERROR render loops", () => {
    const dashboardUtils = read("frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts");
    const customizeDialog = read("frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx");
    const checkedSources = [
      read("frontend/src/features/hr-reports/HrReportsPage.tsx"),
      read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx"),
      read("frontend/src/features/reports/ReportsPage.tsx"),
      read("frontend/src/components/forms/AppDatePicker.tsx"),
      read("frontend/src/components/forms/AppDateRangePicker.tsx"),
      read("frontend/src/components/forms/AppMonthPicker.tsx"),
    ].join("\n");
    expect(dashboardUtils).toContain("useMemo");
    expect(dashboardUtils).toContain("mergeDashboardPreferences");
    expect(customizeDialog).toContain("widgetSignature");
    expect(customizeDialog).toContain("stableWidgets");
    expect(checkedSources).not.toMatch(/if\s*\([^)]*\)\s*set[A-Z][A-Za-z0-9_]*\s*\(/);
    expect(checkedSources).not.toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*{[^}]*set[A-Z][A-Za-z0-9_]*\s*\(/s);
  });

  it("does not introduce browser alerts, confirms, or dark mode in utility pages", () => {
    const combined = [
      read("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx"),
      read("frontend/src/features/import-export/ImportExportPage.tsx"),
      read("frontend/src/features/reports/ReportsPage.tsx"),
      read("frontend/src/features/hr-reports/HrReportsPage.tsx"),
      read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx"),
      read("frontend/src/components/forms/AppDatePicker.tsx"),
      read("frontend/src/components/forms/AppDateRangePicker.tsx"),
      read("frontend/src/components/forms/AppMonthPicker.tsx"),
    ].join("\n");
    expect(combined).not.toMatch(/\b(window\.)?(alert|confirm|prompt)\s*\(/);
    expect(combined).not.toContain("dark:");
  });
});
