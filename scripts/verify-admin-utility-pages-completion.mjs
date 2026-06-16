import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const exists = (path) => existsSync(resolve(root, path));
const fail = (message) => {
  throw new Error(`verify:admin-utility-pages-completion failed: ${message}`);
};
const mustInclude = (label, source, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} missing ${token}`);
  }
};
const mustNotInclude = (label, source, tokens) => {
  for (const token of tokens) {
    if (source.includes(token)) fail(`${label} must not include ${token}`);
  }
};

const backupPage = read("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx");
const importExportPage = read("frontend/src/features/import-export/ImportExportPage.tsx");
const importExportTypes = read("frontend/src/features/import-export/import-export.types.ts");
const reportsPage = read("frontend/src/features/reports/ReportsPage.tsx");
const hrReportsPage = read("frontend/src/features/hr-reports/HrReportsPage.tsx");
const payrollReportsPage = read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
const reportActions = read("frontend/src/features/report-exports/ReportExportActions.tsx");
const reportTypes = read("frontend/src/features/reports/reports.types.ts");
const reportValidators = read("src/modules/reports/reports.validators.ts");
const importValidators = read("src/modules/import-export/import-export.validators.ts");
const importValidationService = read("src/modules/import-export/import-validation.service.ts");
const importJobService = read("src/modules/import-export/import-job.service.ts");
const reportExportService = read("src/modules/report-exports/report-exports.service.ts");
const dataTable = read("frontend/src/components/data/DataTable.tsx");
const employeeAvatar = read("frontend/src/components/employees/EmployeeAvatar.tsx");
const employee360Page = read("frontend/src/features/employees/Employee360Page.tsx");
const employeeList = read("frontend/src/features/employees/EmployeeList.tsx");
const selfServiceShared = read("frontend/src/features/self-service/SelfServiceShared.tsx");
const profilePage = read("frontend/src/features/profile/ProfilePage.tsx");
const employeePhotoControls = read("frontend/src/features/employees/EmployeeProfilePhotoControls.tsx");
const employeeService = read("src/modules/employees/employees.service.ts");
const employeeValidators = read("src/modules/employees/employees.validators.ts");
const employeeRoutes = read("src/routes/employees.routes.ts");
const selfServiceRepository = read("src/modules/self-service/self-service.repository.ts");
const dashboardPersonalizationUtils = read("frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts");
const dashboardCustomizeDialog = read("frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx");
const packageJson = read("package.json");
const tests = read("tests/admin-utility-pages-completion.test.ts");

const walk = (dir) => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`;
  if (entry.isDirectory()) return ["node_modules", "dist", "build"].includes(entry.name) ? [] : walk(path);
  return entry.isFile() ? [path] : [];
});

mustInclude("BackupRecoveryPage", backupPage, [
  "Backup & Recovery",
  "Create backups, verify backup integrity, manage retention, and safely restore company data.",
  "BackupOverview",
  "Retention Policy",
  "Backup Settings",
  "Restore preview",
  "TechnicalDetails",
  "confirmDisabled",
  "RESTORE COMPANY DATA",
]);
mustNotInclude("BackupRecoveryPage", backupPage, ["fixed bottom-4", "<JsonPanel value={statusQuery"]);
const staleBackupPlaceholderPath = ["frontend/src/features/backup-recovery", "BackupRecovery", "PlaceholderPage.tsx"].join("/");
if (exists(staleBackupPlaceholderPath)) fail("stale backup recovery fallback file remains in the completed route area.");

mustInclude("ImportExportPage", importExportPage, [
  "Excel workbook",
  "PDF report",
  "Upload an Excel file for validation before applying import changes.",
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
mustInclude("Import/export types", importExportTypes, ['format: "xlsx" | "pdf"', 'file_type: "xlsx"']);
mustInclude("Import/export validators", importValidators, ["Only Excel .xlsx import files are supported."]);
mustInclude("Import/export Excel parser", importValidationService, ["readZipEntries", "parseWorksheet", "requiredHeaders", "preview_rows"]);
mustInclude("Import/export upload and apply safety", importJobService, ["0x50", "0x4b", "parseImportWorkbook", "insertImportedEmployees", "markImportApplied", "UNSUPPORTED_IMPORT_TEMPLATE"]);
mustNotInclude("Import/export apply", importJobService, ["IMPORT_APPLY_NOT_CONFIGURED"]);
mustNotInclude("ImportExportPage", importExportPage, ['<SelectItem value="json"', '<SelectItem value="csv"', "CSV or JSON", "Please upload a CSV"]);
mustNotInclude("Legacy Import Center redirect", read("frontend/src/features/imports/ImportCenterPage.tsx"), ["Template CSV", "CSV file", "csv_content", ".csv"]);

mustInclude("ReportsPage", reportsPage, [
  "Generate Excel",
  "Generate PDF",
  "Report outputs are generated as Excel or PDF files.",
  "AppDateRangePicker",
  "AppMonthPicker",
]);
mustInclude("ReportExportActions", reportActions, ["Download Excel", "Download PDF"]);
mustInclude("Report types", reportTypes, ['format: "xlsx" | "pdf"']);
mustInclude("Report validators", reportValidators, ["Only Excel and PDF report exports are supported."]);
mustInclude("Report export service", reportExportService, ["generateExcelWorkbook", "generatePdfReport", "excelContentType", "Only Excel and PDF report exports are supported."]);
mustNotInclude("ReportsPage", reportsPage, ["Generate JSON report", "CSV/PDF/XLSX export formatting", 'Input type="date"']);
mustNotInclude("ReportExportActions", reportActions, [">CSV<", "exportCsv"]);

mustInclude("DataTable overflow wrapper", dataTable, [
  "w-full min-w-0 space-y-3 overflow-hidden",
  "w-full overflow-x-auto",
  "min-w-max w-full",
]);
mustInclude("HR Reports responsive filters", hrReportsPage, [
  "AppDateRangePicker",
  "EmployeeAvatar",
  "lg:grid-cols-[300px_minmax(0,1fr)]",
  "max-w-xs truncate",
  "Excel/PDF output",
]);
mustInclude("Payroll Reports responsive filters", payrollReportsPage, [
  "AppDateRangePicker",
  "AppMonthPicker",
  "EmployeeAvatar",
  "lg:grid-cols-[320px_minmax(0,1fr)]",
  "max-w-xs truncate",
  "Excel/PDF output",
]);
mustNotInclude("HR Reports", hrReportsPage, ['Input type="date"', "Export-ready JSON", "w-screen"]);
mustNotInclude("Payroll Reports", payrollReportsPage, ['Input type="date"', 'Input type="month"', "Export-ready JSON", "w-screen"]);

mustInclude("EmployeeAvatar", employeeAvatar, ["EmployeeAvatar", "initialsFor", "UserRound"]);
mustInclude("Employee list avatar", employeeList, ["EmployeeAvatar", "profile_photo_url", "Missing photo"]);
mustInclude("Employees missing photo summary", read("frontend/src/features/employees/EmployeesPage.tsx"), ["Missing profile photos", "Visible employees needing photo upload"]);
mustInclude("Employee 360 profile photo controls", employee360Page, ["EmployeeAvatar", "EmployeeProfilePhotoControls", "employees.profilePhoto.upload", "employees.profilePhoto.manage", "Missing profile photo"]);
mustInclude("Self-service avatar display", selfServiceShared, ["EmployeeAvatar", "profile_photo_url"]);
mustInclude("Standalone profile fallback", profilePage, ["EmployeeAvatar", "Standalone account · no employee photo required"]);
mustInclude("Employee profile photo controls", employeePhotoControls, [
  "image/jpeg",
  "image/png",
  "image/webp",
  "2 * 1024 * 1024",
  "EmployeeProfilePhotoControls",
]);
mustInclude("Employee profile photo backend", employeeService, [
  "DOCUMENTS_BUCKET.put",
  "profile_photo_key: _profilePhotoKey",
  "employee_profile_photo_updated",
  "employee_profile_photo_removed",
  "profilePhotoPermissions",
]);
mustInclude("Employee profile photo validators", employeeValidators, ["maxProfilePhotoBytes", "image/jpeg", "image/png", "image/webp"]);
mustInclude("Employee profile photo routes", employeeRoutes, ["/:id/profile-photo", "employees.profilePhoto.view", "employees.profilePhoto.upload", "employees.profilePhoto.manage"]);
mustInclude("Self service profile photo URL", selfServiceRepository, ["profile_photo_key", "profile_photo_updated_at"]);
if (!exists("migrations/0079_employee_profile_photo_metadata.sql")) fail("employee profile photo metadata migration is missing");
mustInclude("Employee profile photo migration", read("migrations/0079_employee_profile_photo_metadata.sql"), ["profile_photo_key", "profile_photo_updated_at", "profile_photo_uploaded_by"]);

mustInclude("Dashboard personalization loop guard", dashboardPersonalizationUtils, ["useMemo", "mergeDashboardPreferences"]);
mustInclude("Customize dialog loop guard", dashboardCustomizeDialog, ["widgetSignature", "stableWidgets"]);

for (const path of [
  "frontend/src/components/forms/AppDatePicker.tsx",
  "frontend/src/components/forms/AppDateRangePicker.tsx",
  "frontend/src/components/forms/AppMonthPicker.tsx",
]) {
  if (!exists(path)) fail(`${path} is missing`);
}

const nativeDateExceptions = new Set([
  "frontend/src/components/forms/AppDatePicker.tsx",
  "frontend/src/components/forms/AppMonthPicker.tsx",
]);
for (const path of walk("frontend/src").filter((file) => /\.(tsx|ts)$/.test(file))) {
  const source = read(path);
  if (/type=["'](?:date|month)["']|inputType=["']date["']/.test(source) && !nativeDateExceptions.has(path)) {
    fail(`native browser date/month input remains in ${path}`);
  }
}

const frontendUtilitySources = [
  backupPage,
  importExportPage,
  reportsPage,
  hrReportsPage,
  payrollReportsPage,
  reportActions,
  read("frontend/src/components/forms/AppDatePicker.tsx"),
  read("frontend/src/components/forms/AppDateRangePicker.tsx"),
  read("frontend/src/components/forms/AppMonthPicker.tsx"),
].join("\n");
if (/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendUtilitySources)) fail("browser alert/confirm/prompt usage exists in utility pages");
if (/dark:/.test(frontendUtilitySources)) fail("dark mode classes were introduced in utility pages");
if (/if\s*\([^)]*\)\s*set[A-Z][A-Za-z0-9_]*\s*\(/.test(frontendUtilitySources)) fail("possible setState during render pattern exists in utility/report pages");
if (/useEffect\s*\(\s*\(\)\s*=>\s*{[^}]*set[A-Z][A-Za-z0-9_]*\s*\(/s.test(`${hrReportsPage}\n${payrollReportsPage}\n${reportsPage}`)) fail("report pages should not sync state from unstable effects");

mustInclude("tests", tests, [
  "Import/Export exposes Excel and PDF only",
  "Reports generate Excel/PDF",
  "shared date picker components",
  "HR and payroll report tables are contained",
  "employee avatars are available",
  "UI_RENDER_ERROR render loops",
]);
if (!packageJson.includes('"verify:admin-utility-pages-completion"')) fail("package.json is missing verify:admin-utility-pages-completion");

console.log("verify:admin-utility-pages-completion passed");
