import { existsSync, readFileSync } from "node:fs";

const failures = [];
const read = (file) => readFileSync(file, "utf8");
const mustExist = (file) => {
  if (!existsSync(file)) failures.push(`${file} is missing.`);
};
const mustInclude = (label, file, phrase) => {
  const text = read(file);
  if (!text.includes(phrase)) failures.push(`${label} missing ${phrase}`);
};

const frontendFiles = [
  "frontend/src/features/dashboard/AdminCommandCenterPage.tsx",
  "frontend/src/features/dashboard/CommandCenterHeader.tsx",
  "frontend/src/features/dashboard/PeopleSnapshotWidget.tsx",
  "frontend/src/features/dashboard/AttendancePulseWidget.tsx",
  "frontend/src/features/dashboard/ApprovalCommandQueueWidget.tsx",
  "frontend/src/features/dashboard/PayrollReadinessWidget.tsx",
  "frontend/src/features/dashboard/DocumentExpiryWidget.tsx",
  "frontend/src/features/dashboard/RosterCoverageWidget.tsx",
  "frontend/src/features/dashboard/DepartmentHealthWidget.tsx",
  "frontend/src/features/dashboard/EmployeeAttentionWidget.tsx",
  "frontend/src/features/dashboard/LifecycleWidget.tsx",
  "frontend/src/features/dashboard/DisciplinaryFollowUpWidget.tsx",
  "frontend/src/features/dashboard/OperationOwnershipHealthWidget.tsx",
  "frontend/src/features/dashboard/RecentActivityWidget.tsx",
  "frontend/src/features/dashboard/commandCenter.api.ts",
  "frontend/src/features/dashboard/commandCenter.types.ts",
  "frontend/src/features/dashboard/commandCenter.utils.tsx",
];

for (const file of frontendFiles) mustExist(file);
mustExist("tests/admin-command-center-dashboard.test.ts");

mustInclude("backend dashboard route", "src/routes/dashboard.routes.ts", '"/command-center"');
mustInclude("backend dashboard controller", "src/modules/dashboard/dashboard.controller.ts", "commandCenter");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "getCommandCenter");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "moduleEnabled(features");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "visibleActions(actor, features");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "approvalQueueCounts");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "safeCommandCenterQuery");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "employeeSetupHealth");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "operationOwnershipHealth");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "recentAuditActivity");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "disciplinary_actions");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "resignation_offboarding");
mustInclude("backend dashboard service", "src/modules/dashboard/dashboard.service.ts", "operation_ownership");
mustInclude("backend dashboard repository", "src/modules/dashboard/dashboard.repository.ts", "FROM approval_requests r");
mustInclude("backend dashboard repository", "src/modules/dashboard/dashboard.repository.ts", "permissionSet.has");
mustInclude("D1 binding helper", "src/utils/d1.ts", "MAX_D1_BINDINGS");
mustInclude("D1 binding helper", "src/utils/d1.ts", "chunkArray");
mustInclude("error logger", "src/utils/error-logger.ts", "PRAGMA table_info(system_error_logs)");
mustInclude("error logger", "src/utils/error-logger.ts", "existingColumns.has(column)");
mustInclude("backend dashboard repository", "src/modules/dashboard/dashboard.repository.ts", "FROM employee_kyc_update_requests r");
mustInclude("backend dashboard repository", "src/modules/dashboard/dashboard.repository.ts", "FROM operation_responsibility_matrix");
mustInclude("backend dashboard repository", "src/modules/dashboard/dashboard.repository.ts", "FROM audit_logs a");

mustInclude("AdminCommandCenterPage", "frontend/src/features/dashboard/AdminCommandCenterPage.tsx", "DashboardGrid");
mustInclude("AdminCommandCenterPage", "frontend/src/features/dashboard/AdminCommandCenterPage.tsx", "CommandCenterHeader");
mustInclude("AdminCommandCenterPage", "frontend/src/features/dashboard/AdminCommandCenterPage.tsx", "commandCenterApi.get");
mustInclude("PeopleSnapshotWidget", "frontend/src/features/dashboard/PeopleSnapshotWidget.tsx", "WidgetCard");
mustInclude("PeopleSnapshotWidget", "frontend/src/features/dashboard/PeopleSnapshotWidget.tsx", "MetricTile");
mustInclude("AttendancePulseWidget", "frontend/src/features/dashboard/AttendancePulseWidget.tsx", "StatusStrip");
mustInclude("ApprovalCommandQueueWidget", "frontend/src/features/dashboard/ApprovalCommandQueueWidget.tsx", "ActionQueueWidget");
mustInclude("OperationOwnershipHealthWidget", "frontend/src/features/dashboard/OperationOwnershipHealthWidget.tsx", "ModuleHealthCard");
mustInclude("RecentActivityWidget", "frontend/src/features/dashboard/RecentActivityWidget.tsx", "TimelineWidget");
mustInclude("command center types", "frontend/src/features/dashboard/commandCenter.types.ts", "CommandCenterResponse");
mustInclude("command center API", "frontend/src/features/dashboard/commandCenter.api.ts", "/dashboard/command-center");
mustInclude("router dashboard route", "frontend/src/app/router.tsx", 'path="/dashboard"');
mustInclude("router dashboard route", "frontend/src/app/router.tsx", "dashboard.view");

const frontendSource = frontendFiles.filter((file) => file.endsWith(".tsx") || file.endsWith(".ts")).map(read).join("\n");
if (/\b(?:window\.)?alert\s*\(/.test(frontendSource)) failures.push("Browser alert() usage introduced in command-center frontend.");
if (/\b(?:window\.)?confirm\s*\(/.test(frontendSource)) failures.push("Browser confirm() usage introduced in command-center frontend.");
if (/\bdarkMode\b/.test(frontendSource) || /\bdark:[\w-]/.test(frontendSource)) failures.push("Dark mode marker introduced in command-center frontend.");

const tests = read("tests/admin-command-center-dashboard.test.ts");
for (const phrase of [
  "Admin Command Center page renders",
  "disabled attendance hides Attendance Pulse",
  "missing payroll permission hides Payroll Readiness",
  "standalone Super Admin sees admin widgets but no self-service widgets",
  "backend command center route requires authentication",
  "approval queue rows hide disabled module approvals",
  "uses real scoped aggregate queries",
  "approval queue counts come from approval request operation data",
  "recent activity widgets use their own data sources",
]) {
  if (!tests.includes(phrase)) failures.push(`admin command center tests missing ${phrase}`);
}

const service = read("src/modules/dashboard/dashboard.service.ts");
const repository = read("src/modules/dashboard/dashboard.repository.ts");
const errorLogger = read("src/utils/error-logger.ts");
const forbiddenPlaceholders = [
  /employees_without_login:\s*0/,
  /employees_missing_level:\s*0/,
  /pending_kyc_updates:\s*0/,
  /pending_reviews:\s*0/,
  /operations_missing_owner:\s*0/,
  /countApprovalRow\("advance-salary"[^)]*,\s*0\s*,/,
  /countApprovalRow\("discipline"[^)]*,\s*0\s*,/,
  /countApprovalRow\("employee-structure"[^)]*,\s*0\s*,/,
  /pending_document_approvals:\s*n\(data\.expiry_alerts\?\.critical_alerts\)/,
  /pending_roster_changes:\s*n\(data\.holiday_roster_context\?\.open_roster_conflicts\)/,
  /final_settlement_review_pending:\s*n\(data\.long_leave\?\.payroll_review_required\)/,
  /rows:\s*attention\.data\.slice/,
];
for (const pattern of forbiddenPlaceholders) {
  if (pattern.test(service)) failures.push(`backend dashboard service still contains placeholder/proxy metric pattern: ${pattern}`);
}
if (/permissions\.map\(\(\) => "\?"\)|s\.required_permission IN \(\$\{permissionPlaceholders\}\)/.test(repository)) {
  failures.push("approval queue still uses an unbounded permission placeholder list.");
}
if (!repository.includes("chunkArray(operationTypes)") || !repository.includes("permissionSet.has(row.required_permission)")) {
  failures.push("approval queue must chunk operation filters and evaluate permission eligibility in TypeScript.");
}
if (!service.includes("safeCommandCenterQuery") || !service.includes('"unavailable"')) {
  failures.push("command center must isolate optional widget failures and return unavailable widget state.");
}
if (!errorLogger.includes("PRAGMA table_info(system_error_logs)") || /INSERT INTO system_error_logs \([\s\S]*environment[\s\S]*\) VALUES/.test(errorLogger)) {
  failures.push("system error logging must be schema-resilient for optional environment column.");
}
if (!tests.includes("hundreds of permissions") || !tests.includes("one command-center widget failure does not crash")) {
  failures.push("admin command center tests must cover permission overflow and widget failure isolation.");
}

if (failures.length > 0) {
  console.error("Admin Command Center dashboard verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin Command Center dashboard verification passed.");
