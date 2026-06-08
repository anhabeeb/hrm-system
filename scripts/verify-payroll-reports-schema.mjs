import fs from "node:fs";

const fail = (message) => {
  console.error(`verify:payroll-reports-schema failed: ${message}`);
  process.exit(1);
};

const read = (path) => {
  if (!fs.existsSync(path)) fail(`${path} is missing`);
  return fs.readFileSync(path, "utf8");
};

const mustInclude = (source, needles, label) => {
  for (const needle of needles) {
    if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
  }
};

const app = read("src/app.ts");
const routes = read("src/routes/payroll-reports.routes.ts");
const definitions = read("src/modules/payroll-reports/payroll-reports.definitions.ts");
const service = read("src/modules/payroll-reports/payroll-reports.service.ts");
const repository = read("src/modules/payroll-reports/payroll-reports.repository.ts");
const validators = read("src/modules/payroll-reports/payroll-reports.validators.ts");
const page = read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
const router = read("frontend/src/app/router.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const packageJson = read("package.json");
const tests = read("tests/payroll-reports.test.ts");

if (!app.includes("payrollReportsRoutes") || !app.includes('"/payroll-reports"')) fail("payroll report routes are not registered");
mustInclude(routes, [
  '"/catalog"',
  '"/monthly-summary"',
  '"/employee-detail"',
  '"/salary-compensation"',
  '"/deductions"',
  '"/advances"',
  '"/salary-loans"',
  '"/attendance-deductions"',
  '"/overtime"',
  '"/long-leave-deductions"',
  '"/leave-deductions"',
  '"/payslip-status"',
  '"/approval-finalization"',
  '"/outlet-cost"',
  '"/department-cost"',
  '"/variance"',
  '"/audit"',
  '"/finance-summary"',
  "requireFeature(\"reports\")",
  "payroll_reports.view",
], "payroll report routes");
if (routes.indexOf('"/catalog"') > routes.indexOf('requirePermission("payroll_reports.view")')) {
  fail("/catalog is still blocked by the global payroll_reports.view middleware");
}

mustInclude(definitions, [
  "monthly-summary",
  "employee-detail",
  "salary-compensation",
  "salary-changes",
  "deductions",
  "advances",
  "salary-loans",
  "attendance-deductions",
  "overtime",
  "long-leave-deductions",
  "leave-deductions",
  "payslip-status",
  "approval-finalization",
  "outlet-cost",
  "department-cost",
  "variance",
  "audit",
  "finance-summary",
  "sensitive: true",
  "export_ready: true",
], "payroll report definitions");

mustInclude(service, [
  "payroll_reports.sensitive_amounts.view",
  "safeRows",
  "columns.filter((column) => !column.sensitive)",
  "restricted",
  "currency",
  "runReport",
], "payroll report sensitive guard and metadata");

mustInclude(repository, [
  "employeeScope",
  "payrollRunEmployeeScope",
  "auditEmployeeScope",
  "context.outletIds",
  "payroll_runs",
  "payroll_items",
  "payroll_earnings",
  "payroll_deductions",
  "advance_payments",
  "salary_loans",
  "attendance_daily_summary",
  "long_leave_payroll_impacts",
  "payslips",
  "approval_requests",
  "audit_logs",
  "LIMIT ? OFFSET ?",
], "payroll report repository");
mustInclude(repository, [
  "FROM payroll_items scoped_pi",
  "scoped_pi.payroll_run_id = ${runAlias}.id",
  "primary_outlet_id IN",
], "Payroll Approval / Finalization outlet scoping");
mustInclude(repository, [
  "FROM audit_logs al",
  "FROM employees e",
  "e.id = al.employee_id",
  "payroll_items scoped_pi",
  "payslips scoped_ps",
  "advance_payments scoped_adv",
  "salary_loans scoped_loan",
  "long_leave_payroll_impacts scoped_lli",
  "employee_salary_history scoped_salary",
], "Payroll Audit employee/outlet scoping");
mustInclude(repository + definitions, [
  "paid_this_month",
  "total_paid_to_date",
  "remaining_balance",
], "Salary Loan paid amount semantics");
if (definitions.includes('c("total_paid",') || /AS total_paid,\s/.test(repository)) {
  fail("Salary Loan report still exposes ambiguous total_paid without paid_this_month and total_paid_to_date");
}
if (/metadata_json|snapshot_json|file_key|password_hash|device_token|raw_payload|calculation_metadata_json|calculation_settings_json/.test(repository + page)) {
  fail("payroll reports expose unsafe metadata, file keys, secrets, or raw calculation payloads");
}
if (/jsPDF|xlsx|XLSX|window\.print|downloadBlob|createObjectURL|text\/csv|application\/pdf/.test(page + repository + service + routes)) {
  fail("Phase 11C must not implement PDF, Excel, CSV, downloadable files, or print export");
}
mustInclude(validators, ["MAX_PAGE_SIZE", "periodRequired", "variance_threshold", "page_size"], "payroll report validators");

mustInclude(permissions, [
  "payroll_reports.view",
  "payroll_reports.catalog.view",
  "payroll_reports.summary.view",
  "payroll_reports.employee.view",
  "payroll_reports.salary.view",
  "payroll_reports.deductions.view",
  "payroll_reports.advances.view",
  "payroll_reports.loans.view",
  "payroll_reports.attendance_deductions.view",
  "payroll_reports.overtime.view",
  "payroll_reports.long_leave.view",
  "payroll_reports.leave_deductions.view",
  "payroll_reports.payslips.view",
  "payroll_reports.approvals.view",
  "payroll_reports.cost.view",
  "payroll_reports.variance.view",
  "payroll_reports.audit.view",
  "payroll_reports.finance_summary.view",
  "payroll_reports.sensitive_amounts.view",
], "payroll report permissions");
if (!roles.includes("rp_payroll_reports_admin") || !roles.includes("rp_payroll_reports_hr_limited")) fail("payroll report permissions are not seeded to expected roles");

if (!router.includes('"/payroll-reports"') || !router.includes("PayrollReportsPage")) fail("Payroll Reports frontend route is missing");
if (!navigation.includes("Payroll / Finance Reports") || !navigation.includes("/payroll-reports")) fail("Payroll Reports navigation item is missing");
mustInclude(page, [
  "Report catalog",
  "Payroll Summary",
  "Salary / Compensation",
  "Deductions",
  "Advances & Loans",
  "Attendance / Overtime",
  "Long Leave / Leave",
  "Payslips",
  "Approval / Finalization",
  "Cost Summary",
  "Payroll Audit",
  "View Employee 360",
  "formatMoneyMinor",
  "ReportExportActions",
  "payroll:",
], "Payroll Reports frontend page");
if (/dark:|metadata_json|snapshot_json|file_key|raw_payload|password_hash|device_token/.test(page)) fail("Payroll Reports frontend exposes unsafe fields or dark mode styling");

if (!packageJson.includes("verify:payroll-reports-schema")) fail("package.json is missing verify:payroll-reports-schema");
if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 11C payroll reports tests contain TODO placeholders");
mustInclude(tests, [
  "catalog returns payroll reports",
  "catalog-only permission can view catalog but cannot run report data",
  "normal employee cannot access payroll reports",
  "sensitive amounts hidden without permission",
  "sensitive amounts shown with permission",
  "monthly summary uses payroll item subqueries to avoid duplicate totals",
  "outlet scoping enforced",
  "Payroll Audit report outlet scoping",
  "Payroll Audit unscoped rows hidden from outlet-scoped users",
  "Payroll Approval / Finalization outlet scoping",
  "Admin/Super Admin can see company-wide approval finalization report",
  "Salary Loan paid_this_month and total_paid_to_date are different where expected",
  "sensitive amount guard hides salary loan paid values without permission",
  "long-leave deduction report uses Phase 9C payroll impacts",
  "payslip status includes missing finalized warning",
  "Payroll Reports route/page exists",
], "payroll reports tests");

console.log("verify:payroll-reports-schema passed");
