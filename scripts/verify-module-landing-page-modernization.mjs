import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    failures.push(`Missing ${path}`);
    return "";
  }
  return readFileSync(full, "utf8");
};
const ensure = (condition, message) => {
  if (!condition) failures.push(message);
};
const includesAll = (content, tokens, label) => {
  for (const token of tokens) ensure(content.includes(token), `${label} missing ${token}`);
};

const componentDir = "frontend/src/components/module-landing";
[
  "ModuleLandingHeader.tsx",
  "ModuleLandingShell.tsx",
  "ModuleSummaryGrid.tsx",
  "ModuleSummaryTile.tsx",
  "ModuleAttentionPanel.tsx",
  "ModuleQuickActions.tsx",
  "ModuleSetupNotice.tsx",
  "ModuleStatusStrip.tsx",
  "ModuleTableSection.tsx",
  "ModuleEmptyState.tsx",
  "ModuleFilterSummary.tsx",
  "index.ts",
].forEach((file) => ensure(existsSync(resolve(root, componentDir, file)), `Missing shared ModuleLanding component ${file}`));

const pages = [
  ["Employees", "frontend/src/features/employees/EmployeesPage.tsx", ["EmployeeList"]],
  ["Attendance", "frontend/src/features/attendance/AttendancePage.tsx", ["AttendanceSummaryTable", "EmployeeAttendanceCalendarWidget"]],
  ["Leave", "frontend/src/features/leave/LeavePage.tsx", ["LeaveRequestsTable", "LeaveBalancesTable"]],
  ["Roster", "frontend/src/features/rosters/RostersPage.tsx", ["DataTable", "RosterWeeklyMatrixPage"]],
  ["Payroll", "frontend/src/features/payroll/PayrollPage.tsx", ["PayrollRunsTable", "PayrollAdjustmentsTable"]],
  ["Documents/KYC", "frontend/src/features/documents/DocumentsPage.tsx", ["DocumentsTable", "DocumentKycRequestsTable"]],
  ["Approvals", "frontend/src/features/approvals/ApprovalsPage.tsx", ["ApprovalInboxTable", "ApprovalEngineRequestsTable"]],
  ["Operation Ownership", "frontend/src/features/operation-ownership/OperationOwnershipPage.tsx", ["OperationMatrixTable", "SetupWarningsPanel"]],
  ["Offboarding", "frontend/src/features/offboarding/OffboardingPage.tsx", ["<Table", "EmployeeExitDetailDrawer"]],
  ["Disciplinary", "frontend/src/features/discipline/DisciplinaryActionsPage.tsx", ["DisciplinaryActionsTable"]],
];

const pageTexts = [];
for (const [label, path, preservedTokens] of pages) {
  const text = read(path);
  pageTexts.push(text);
  includesAll(text, ["ModuleLandingHeader", "ModuleSummaryGrid", "ModuleSummaryTile", "ModuleAttentionPanel"], `${label} landing page`);
  ensure(/ModuleQuickActions|actions=\{\(/.test(text), `${label} landing page missing quick action support`);
  for (const token of preservedTokens) ensure(text.includes(token), `${label} existing table/list workflow no longer detected (${token})`);
  ensure(/has\(|auth\.has|can[A-Z]|hasAnyPermission|hasPermission/.test(text), `${label} does not appear to keep permission-aware visibility/action checks`);
}

const combinedPages = pageTexts.join("\n");
ensure(!/pending_count:\s*0|employees_without_login:\s*0|pending_kyc_updates:\s*0|pending_reviews:\s*0|operations_missing_owner:\s*0/.test(combinedPages), "Fake placeholder metric pattern found in module landing pages.");
ensure(!/value=\{[^}]*["'`](Open tab|Select run|Restricted|Open queue|Open inbox)["'`]/.test(combinedPages), "Misleading action/access phrase used as primary ModuleSummaryTile value.");
ensure(!/Search selector coming soon/.test(combinedPages), "Placeholder selector wording leaked into landing pages.");
ensure(!/alert\s*\(/.test(combinedPages), "Browser alert() usage found in modernized module pages.");
ensure(!/confirm\s*\(/.test(combinedPages), "Browser confirm() usage found in modernized module pages.");
ensure(!/dark:|darkMode|ThemeProvider/.test(combinedPages), "Dark mode implementation found in modernized module pages.");

const employees = read("frontend/src/features/employees/EmployeesPage.tsx");
ensure(employees.includes("activeEmployees = employeeRows.filter"), "Employees active metric must be filtered from visible active rows, not pagination total.");
ensure(!/label="Active employees"\s+value=\{totalEmployees\}/.test(employees), "Employees active metric appears to use pagination total.");
includesAll(employees, ["canUseEmployeeLoginModule", "canViewStructureChanges", "canViewDocumentKycAttention", "canViewLifecycleAttention"], "Employees permission-aware landing actions");

const attendance = read("frontend/src/features/attendance/AttendancePage.tsx");
ensure(attendance.includes("todayStatusCount"), "Attendance landing must use today-only status counts.");
ensure(!/todayRows\.length\s*\?\s*todayRows[\s\S]{0,160}:\s*statusCount/.test(attendance), "Attendance present metric falls back to all loaded rows when today rows are empty.");
includesAll(attendance, ["canViewReports", "canViewCorrections", "canViewCalendar", "Today only"], "Attendance permission-aware landing actions");

const leave = read("frontend/src/features/leave/LeavePage.tsx");
includesAll(leave, ["canViewApprovalInbox", "canViewBalances", "canViewLeaveCalendar", "canViewRosterConflictReview"], "Leave permission-aware landing actions");

const rosters = read("frontend/src/features/rosters/RostersPage.tsx");
includesAll(rosters, ["canViewWeeklyMatrix", "canCreateRoster", "canBulkRoster", "canRequestRosterChange", "canViewLeaveConflictOverlay"], "Roster permission-aware landing actions");

const payroll = read("frontend/src/features/payroll/PayrollPage.tsx");
includesAll(payroll, ["canViewAttendanceReview", "canUsePayrollAdjustments", 'value={adjustmentsQuery.isFetched ? pendingAdjustments : "—"}', 'value={selectedRun ? unresolvedExceptions : "—"}'], "Payroll permission-aware unavailable states");

const documents = read("frontend/src/features/documents/DocumentsPage.tsx");
includesAll(documents, ["documentsKycEnabled", "canUploadDocument", "canCreateKycRequest", 'value={kycQuery.isFetched ? pendingKyc : "—"}'], "Documents/KYC permission-aware unavailable states");

const approvals = read("frontend/src/features/approvals/ApprovalsPage.tsx");
includesAll(approvals, ["canViewMyPendingApprovals", 'value={engineRequestsQuery.isFetched ? pendingEngine : "—"}'], "Approvals permission-aware unavailable states");

const tests = read("tests/module-landing-page-modernization.test.ts");
includesAll(tests, [
  "shared ModuleLanding components exist",
  "each required module landing page uses shared overview components",
  "existing table workflows remain",
  "quick actions remain permission or module aware",
  "no fake placeholder metrics",
  "permission-specific quick action guards",
  "Attendance Present today does not fall back",
  "Employees Active employees is not pagination total",
  "Open tab and Select run are not used as primary metric values",
  "no browser alert confirm or dark mode",
], "Module landing modernization tests");

if (failures.length) {
  console.error("Module landing page modernization verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Module landing page modernization verification passed.");
