import fs from "node:fs";

const fail = (message) => {
  console.error(`verify:hr-reports-schema failed: ${message}`);
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
const routes = read("src/routes/hr-reports.routes.ts");
const definitions = read("src/modules/hr-reports/hr-reports.definitions.ts");
const service = read("src/modules/hr-reports/hr-reports.service.ts");
const repository = read("src/modules/hr-reports/hr-reports.repository.ts");
const validators = read("src/modules/hr-reports/hr-reports.validators.ts");
const page = read("frontend/src/features/hr-reports/HrReportsPage.tsx");
const router = read("frontend/src/app/router.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const packageJson = read("package.json");
const tests = read("tests/hr-reports.test.ts");

if (!app.includes("hrReportsRoutes") || !app.includes('"/hr-reports"')) fail("HR report routes are not registered");
mustInclude(routes, [
  '"/catalog"',
  '"/employee-master"',
  '"/document-compliance"',
  '"/foreign-compliance"',
  '"/leave-balances"',
  '"/leave-requests"',
  '"/long-leave"',
  '"/employee-360-summary"',
  "requireFeature(\"reports\")",
  "hr_reports.view",
], "HR report routes");
if (routes.indexOf('"/catalog"') > routes.indexOf('requirePermission("hr_reports.view")')) {
  fail("/catalog is still blocked by the global hr_reports.view middleware");
}

mustInclude(definitions, [
  "employee-master",
  "employee-status",
  "local-foreign",
  "headcount",
  "new-joiners",
  "probation",
  "contracts",
  "document-compliance",
  "foreign-compliance",
  "leave-balances",
  "leave-requests",
  "long-leave",
  "assets-uniforms",
  "compliance-summary",
  "lifecycle",
  "employee-360-summary",
  "columns",
  "export_ready: true",
], "HR report definitions");

mustInclude(service, ["catalog", "runReport", "report_name", "columns", "applied_filters", "export_ready"], "HR report service metadata");
mustInclude(repository, [
  "employeeScope",
  "context.outletIds",
  "employeeMaster",
  "newJoiners",
  "documentCompliance",
  "foreignCompliance",
  "leaveBalances",
  "leaveRequests",
  "longLeave",
  "employee360Summary",
  "page_size",
  "LIMIT ? OFFSET ?",
], "HR report repository");
mustInclude(repository, [
  "probation_end_date",
  "onboarding_document_status",
  "contract_status",
  "profile_completeness",
], "New Joiners returned columns");
mustInclude(repository, [
  "document_categories cat",
  "applies_to_foreign_employee",
  "applies_to_local_employee",
  "requires_expiry_date",
  "missingRequiredDocumentsSql",
], "Document Compliance required category logic");
if (repository.includes("l.total_days AS duration_days,\n      l.total_days AS holiday_adjusted_duration") && !repository.includes("requested_duration_days")) {
  fail("Leave Request report exposes holiday_adjusted_duration as total_days without requested_duration_days context");
}
mustInclude(repository, [
  "requested_duration_days",
  "julianday(l.end_date)",
  "l.total_days AS holiday_adjusted_duration",
], "Leave Request requested vs adjusted duration logic");
if (/password_hash|token_hash|device_token|raw_payload|metadata_json|file_key/.test(repository)) fail("HR reports repository references unsafe fields");
if (/gross_amount|net_amount|payroll_items|payslip|ledger|finalize/i.test(definitions + routes + page)) fail("Phase 11B must not implement full finance/payroll reports");
mustInclude(validators, ["MAX_PAGE_SIZE", "historyRequired", "page_size"], "HR report validators");

mustInclude(permissions, [
  "hr_reports.view",
  "hr_reports.employee.view",
  "hr_reports.compliance.view",
  "hr_reports.documents.view",
  "hr_reports.leave.view",
  "hr_reports.long_leave.view",
  "hr_reports.assets.view",
  "hr_reports.lifecycle.view",
  "hr_reports.employee_360.view",
  "hr_reports.catalog.view",
], "HR report permissions");
if (!roles.includes("rp_hr_reports_admin") || !roles.includes("rp_hr_reports_manager")) fail("HR report permissions are not seeded to expected roles");

if (!router.includes('"/hr-reports"') || !router.includes("HrReportsPage")) fail("HR Reports frontend route is missing");
if (!navigation.includes("HR Reports") || !navigation.includes("/hr-reports")) fail("HR Reports navigation item is missing");
mustInclude(page, [
  "Report catalog",
  "Employee Reports",
  "Compliance Reports",
  "Leave Reports",
  "Long Leave",
  "Assets/Uniforms",
  "View Employee 360",
  "ReportExportActions",
  "hr:",
], "HR Reports frontend page");
if (/dark:|metadata_json|raw_payload|password_hash|token_hash|file_key/.test(page)) fail("HR Reports frontend exposes unsafe fields or dark mode styling");
if (!packageJson.includes("verify:hr-reports-schema")) fail("package.json is missing verify:hr-reports-schema");
if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 11B HR reports tests contain TODO placeholders");
mustInclude(tests, [
  "catalog returns HR reports",
  "catalog-only permission can view catalog but cannot run report data",
  "New Joiners report returns probation document contract and profile columns",
  "Document Compliance uses required document category applicability rules",
  "Document Compliance ignores inactive categories and uploaded required documents clear missing count",
  "outlet scoping enforced",
  "masked identity numbers by default",
  "leave balance report uses Phase 9A balances",
  "requested_duration_days",
  "HR Reports route/page exists",
], "HR reports tests");

console.log("verify:hr-reports-schema passed");
