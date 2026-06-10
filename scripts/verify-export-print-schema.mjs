import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(`verify:export-print-schema failed: ${message}`);
};
const mustInclude = (source, tokens, label) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} missing ${token}`);
  }
};

const app = read("src/app.ts");
const routes = read("src/routes/report-exports.routes.ts");
const service = read("src/modules/report-exports/report-exports.service.ts");
const repository = read("src/modules/report-exports/report-exports.repository.ts");
const migration = read("migrations/0049_report_export_jobs.sql");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const router = read("frontend/src/app/router.tsx");
const nav = read("frontend/src/lib/navigation.ts");
const actions = read("frontend/src/features/report-exports/ReportExportActions.tsx");
const historyPage = read("frontend/src/features/report-exports/ExportHistoryPage.tsx");
const printPage = read("frontend/src/features/report-exports/ReportPrintPage.tsx");
const hrPage = read("frontend/src/features/hr-reports/HrReportsPage.tsx");
const payrollPage = read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
const attendancePage = read("frontend/src/features/attendance/AttendanceReportsPage.tsx");
const employeePage = read("frontend/src/features/employees/Employee360Page.tsx");
const tests = read("tests/export-print.test.ts");
const packageJson = read("package.json");
const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
};

if (!app.includes("reportExportsRoutes") || !app.includes('"/report-exports"')) fail("export routes are not registered");
mustInclude(routes, [
  '"/catalog"',
  '"/jobs"',
  '"/preview"',
  '"/jobs/:id/generate"',
  '"/jobs/:id/download"',
  '"/print/:reportKey"',
  '"/employee/:employeeId/print"',
], "report export routes");

mustInclude(migration, [
  "CREATE TABLE IF NOT EXISTS report_export_jobs",
  "company_id TEXT NOT NULL",
  "filters_json",
  "columns_json",
  "sensitive_export",
  "redaction_level",
  "idx_report_export_jobs_company_idempotency",
], "report export migration");

mustInclude(permissions, [
  "report_exports.catalog.view",
  "report_exports.preview",
  "report_exports.create",
  "report_exports.download",
  "report_exports.cancel",
  "report_exports.history.view",
  "report_exports.print",
  "report_exports.sensitive",
  "report_exports.admin.manage",
  "report_exports.employee_profile.print",
  "report_exports.audit.view",
], "report export permission seeds");
if (!roles.includes("rp_report_exports_admin_") || !roles.includes("rp_report_exports_hr_")) fail("report export permissions are not assigned to default roles");

mustInclude(service, [
  "generateCsv",
  "escapeCsvValue",
  "dangerousFormula",
  "REDACTED",
  "hrReports.runReport(env, actor",
  "payrollReports.runReport(env, actor",
  "attendanceReports.dailyReport(env, actor",
  "REPORT_EXPORT_FORMAT_UNSUPPORTED",
  "REPORT_EXPORT_FILTER_REQUIRED",
  "MAX_EXPORT_ROWS",
  "createAuditLog",
  "report_export_downloaded",
  "type JobAction = \"view\" | \"generate\" | \"download\" | \"cancel\"",
  "requireJob(env, actor, id, \"view\")",
  "requireJob(env, actor, jobId, \"generate\")",
  "requireJob(env, actor, jobId, \"download\")",
  "REPORT_EXPORT_INVALID_STATUS",
  "claimProcessing",
], "report export service");
const getExportJobBody = between(service, "export const getExportJob", "export const listExportJobs");
const generateExportBody = between(service, "export const generateExport", "export const downloadExport");
const downloadExportBody = between(service, "export const downloadExport", "export const printReport");
if (/requireJob\(env,\s*actor,\s*id,\s*"download"\)/.test(getExportJobBody)) fail("getExportJob must not require download permission");
if (/requireJob\(env,\s*actor,\s*jobId,\s*"download"\)/.test(generateExportBody)) fail("generateExport must not require download permission");
if (generateExportBody.includes('if (job.status === "completed") return { export_job: safeJob(job), already_completed: true };') && !/runReport\(env,\s*actor,\s*item,\s*parseJobFilters\(job\)/.test(downloadExportBody)) {
  fail("completed streamed downloads must regenerate CSV from saved filters");
}
if (/from\s+["'](?:pdfkit|jspdf|puppeteer|playwright|xlsx|exceljs)["']|require\(["'](?:pdfkit|jspdf|puppeteer|playwright|xlsx|exceljs)["']\)/i.test(service)) fail("server export code must not use Node-only PDF/XLSX libraries in Phase 11D");
if (service.includes("import-export") || service.includes("backup")) fail("Phase 11D export service appears to start import/backup work");
mustInclude(repository, [
  "requested_by = ?",
  "WHERE company_id = ? AND id = ?",
  "claimProcessing",
  "status IN ('pending', 'failed')",
  "status = 'processing'",
  "status IN ('pending', 'processing')",
], "report export repository");

mustInclude(router, ["/reports/print/:reportKey", "/employees/:employeeId/print", "/report-exports"], "frontend export routes");
mustInclude(nav, ["Export History", "/report-exports"], "frontend navigation");
mustInclude(historyPage, ["Export history page actions", "sensitive_export", "redaction_level"], "export history page");
mustInclude(printPage, ["@media print", "no-print", "HRM System", "Filters:", "Generated at", "window.print"], "print page");
mustInclude(actions, ["report_exports.create", "report_exports.download", "report_exports.print", "report_exports.sensitive"], "export actions");
mustInclude(hrPage, ["ReportExportActions", "hr:"], "HR report export integration");
mustInclude(payrollPage, ["ReportExportActions", "payroll:"], "payroll report export integration");
mustInclude(attendancePage, ["ReportExportActions", "attendance:"], "attendance report export integration");
mustInclude(employeePage, ["Print Profile", "/print"], "Employee 360 print integration");
if (/dark:/.test(`${historyPage}\n${printPage}\n${actions}`)) fail("export/print UI must not add dark mode");
if (/metadata_json/.test(`${historyPage}\n${printPage}`)) fail("export/print UI must not expose raw metadata_json");

if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 11D export/print tests contain TODO placeholders");
mustInclude(tests, [
  "catalog lists exportable reports by permission",
  "CSV protects against spreadsheet formula injection",
  "sensitive columns are omitted or masked without permission",
  "unsupported XLSX/PDF format returns safe error",
  "idempotency prevents duplicate jobs",
  "completed job download returns regenerated CSV content from saved filters",
  "cancelled job cannot be generated",
  "user with history.view can view own job detail without download permission",
  "user with create permission can generate own pending job without download permission",
  "Employee 360 print only shows allowed sections",
  "manager cannot export other outlet data",
  "report print route page exists",
], "export/print tests");

if (!packageJson.includes("verify:export-print-schema")) fail("package.json is missing verify:export-print-schema");
if (!packageJson.includes("npm run verify:export-print-schema")) fail("build:all must run verify:export-print-schema");

console.log("verify:export-print-schema passed");
