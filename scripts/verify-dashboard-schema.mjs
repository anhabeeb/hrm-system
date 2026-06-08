import fs from "node:fs";

const fail = (message) => {
  console.error(`verify:dashboard-schema failed: ${message}`);
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
const routes = read("src/routes/dashboard.routes.ts");
const service = read("src/modules/dashboard/dashboard.service.ts");
const repository = read("src/modules/dashboard/dashboard.repository.ts");
const employeeRoutes = read("src/routes/employees.routes.ts");
const employeeService = read("src/modules/employees/employees.service.ts");
const employeeRepository = read("src/modules/employees/employees.repository.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const dashboardPage = read("frontend/src/features/dashboard/DashboardPage.tsx");
const employee360Page = read("frontend/src/features/employees/Employee360Page.tsx");
const router = read("frontend/src/app/router.tsx");
const employeeList = read("frontend/src/features/employees/EmployeeList.tsx");
const packageJson = read("package.json");
const tests = read("tests/dashboard.test.ts");

if (!app.includes("dashboardRoutes") || !app.includes('"/dashboard"')) fail("dashboard routes are not registered");
mustInclude(routes, [
  '"/summary"',
  '"/attention"',
  '"/attendance-today"',
  '"/approvals"',
  '"/expiry-alerts"',
  '"/device-health"',
  '"/payroll-readiness"',
  '"/quick-actions"',
], "dashboard routes");

mustInclude(permissions, [
  "dashboard.view",
  "dashboard.view_company",
  "dashboard.view_outlet",
  "dashboard.attendance.view",
  "dashboard.leave.view",
  "dashboard.long_leave.view",
  "dashboard.expiry_alerts.view",
  "dashboard.device_health.view",
  "dashboard.payroll_readiness.view",
  "dashboard.admin_health.view",
], "permission seed");
if (!roles.includes("'dashboard'") || !roles.includes("dashboard.view_outlet")) fail("dashboard permissions are not assigned to default roles");

mustInclude(service, [
  "repository.attendanceToday",
  "repository.leaveApprovalCounts",
  "repository.longLeaveCounts",
  "repository.expiryCounts",
  "repository.findActorLinkedEmployeeId",
  "repository.notificationCounts",
  "repository.emailHealth",
  "repository.deviceHealth",
  "repository.holidayRosterContext",
  "repository.payrollReadiness",
], "dashboard service existing-module summaries");
if (!repository.includes("attendance_date = ?") || repository.includes("SELECT * FROM")) fail("dashboard repository must use bounded, selected dashboard queries");
if (
  !repository.includes("FROM leave_approval_steps s") ||
  !repository.includes("LEFT JOIN leave_requests l") ||
  !repository.includes("LEFT JOIN employees e") ||
  !repository.includes("e.primary_outlet_id IN")
) {
  fail("approvalInboxCount must join approval steps back to leave_requests/employees for outlet scoping");
}
if (
  !service.includes("expiry_alerts.view_own") ||
  !service.includes("linkedEmployeeId") ||
  !repository.includes("findActorLinkedEmployeeId") ||
  !repository.includes("a.employee_id = ?")
) {
  fail("dashboard expiry widget must scope expiry_alerts.view_own to the actor linked employee_id");
}

mustInclude(employeeRoutes, [
  '"/:id/profile"',
  '"/:id/profile/summary"',
  '"/:id/profile/attendance"',
  '"/:id/profile/leave"',
  '"/:id/profile/long-leave"',
  '"/:id/profile/documents"',
  '"/:id/profile/contracts"',
  '"/:id/profile/assets"',
  '"/:id/profile/payroll-readiness"',
  '"/:id/profile/alerts"',
  '"/:id/profile/timeline"',
], "Employee 360 profile endpoints");
if (employeeRoutes.indexOf('"/:id/profile"') > employeeRoutes.indexOf('"/:id"')) fail("employee profile routes must be registered before the generic employee id route");
mustInclude(employeeService, ["ensureEmployeeAccess", "getEmployeeProfilePayrollReadiness", "getEmployeeProfileTimeline", "PermissionError", "resolveActorLinkedEmployeeId", "ensureEmployeeProfileSectionAccess"], "Employee 360 service");
mustInclude(employeeRepository, ["profileAttendanceSummary", "profileLeaveBalances", "profileLongLeave", "profileDocuments", "profileContracts", "profileAssets", "profileAlerts", "profileAuditTimeline"], "Employee 360 repository");
if (!employeeRepository.includes("findLinkedEmployeeIdForUser") || !employeeRepository.includes("FROM users")) fail("no helper exists to resolve the actor linked employee ID");
if (
  !employeeService.includes("scopedPermissions: [\"expiry_alerts.view\"]") ||
  !employeeService.includes("ownPermissions: [\"expiry_alerts.view_own\"]") ||
  !employeeService.includes("linkedEmployeeId !== employeeId")
) {
  fail("Employee 360 alert endpoint must require linked employee match for expiry_alerts.view_own");
}
if (/metadata_json|raw_payload_json|api_token_hash|token_hash|password_hash/.test(employee360Page)) fail("Employee 360 frontend references unsafe metadata or secret fields");

if (!router.includes('"/dashboard"') || !router.includes("dashboard.view")) fail("dashboard frontend route is missing or unguarded");
if (!router.includes('"/employees/:employeeId"') || !router.includes("Employee360Page")) fail("Employee 360 frontend route is missing");
mustInclude(dashboardPage, ["Employee Summary", "Attendance Today", "Payroll Readiness", "Employee 360", "Quick Action"], "dashboard page");
mustInclude(employee360Page, [
  "Overview",
  "Attendance",
  "Leave",
  "Long Leave",
  "Documents",
  "Contracts",
  "Assets/Uniforms",
  "Payroll Readiness",
  "Alerts",
  "History",
], "Employee 360 required tabs");
if (!employeeList.includes("View 360 Profile")) fail("employee table is missing Employee 360 row action");
if (!packageJson.includes("verify:dashboard-schema")) fail("package.json is missing verify:dashboard-schema");
if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 11A dashboard tests contain TODO placeholders");
mustInclude(tests, [
  "summary endpoint works",
  "attendance today widget uses attendance summary data",
  "approval inbox role-based count applies outlet scope",
  "expiry dashboard view_own returns own counts only",
  "expiry dashboard view_own with no employee link returns zero counts",
  "Employee 360 alerts tab blocks view_own access to another employee",
  "email health widget is admin-only",
  "Employee 360 route/page exists",
  "payroll readiness requires permission",
], "dashboard tests");

console.log("verify:dashboard-schema passed");
