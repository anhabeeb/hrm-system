import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustExist = (path) => {
  if (!existsSync(resolve(root, path))) failures.push(`${path} is missing.`);
};
const mustInclude = (label, path, token) => {
  const text = read(path);
  if (!text.includes(token)) failures.push(`${label} missing ${token}`);
};

[
  "frontend/src/features/self-service/EmployeeDashboardPage.tsx",
  "frontend/src/features/self-service/dashboard/SelfServiceDashboardPage.tsx",
  "frontend/src/features/self-service/dashboard/SelfServiceCommandHeader.tsx",
  "frontend/src/features/self-service/dashboard/MyAttendanceTodayWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyAttendanceCalendarPreviewWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyLeaveBalanceWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyUpcomingRosterWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyPendingRequestsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyDocumentsKycWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyPayslipsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyApprovalsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyOffboardingStatusWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyAcknowledgementsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MySelfServiceActivityWidget.tsx",
  "frontend/src/features/self-service/dashboard/selfServiceDashboard.api.ts",
  "src/modules/self-service/self-service.service.ts",
  "src/modules/self-service/self-service.repository.ts",
  "src/modules/self-service/self-service.types.ts",
  "tests/employee-self-service-dashboard.test.ts",
].forEach(mustExist);

[
  ["dashboard page", "frontend/src/features/self-service/EmployeeDashboardPage.tsx", "LinkedEmployeeOnlyGuard"],
  ["dashboard page", "frontend/src/features/self-service/EmployeeDashboardPage.tsx", "DashboardGrid"],
  ["dashboard page", "frontend/src/features/self-service/EmployeeDashboardPage.tsx", "SelfServiceCommandHeader"],
  ["dashboard page", "frontend/src/features/self-service/EmployeeDashboardPage.tsx", "MyAttendanceCalendarPreviewWidget"],
  ["command header", "frontend/src/features/self-service/dashboard/SelfServiceCommandHeader.tsx", "quick_actions"],
  ["attendance preview", "frontend/src/features/self-service/dashboard/MyAttendanceCalendarPreviewWidget.tsx", "MiniCalendarWidget"],
  ["attendance today", "frontend/src/features/self-service/dashboard/MyAttendanceTodayWidget.tsx", "MetricTile"],
  ["leave widget", "frontend/src/features/self-service/dashboard/MyLeaveBalanceWidget.tsx", "No leave balance configured yet."],
  ["roster widget", "frontend/src/features/self-service/dashboard/MyUpcomingRosterWidget.tsx", "No upcoming roster found."],
  ["documents widget", "frontend/src/features/self-service/dashboard/MyDocumentsKycWidget.tsx", "pending_kyc_updates"],
  ["payslip widget", "frontend/src/features/self-service/dashboard/MyPayslipsWidget.tsx", "No payslips available yet."],
  ["approvals widget", "frontend/src/features/self-service/dashboard/MyApprovalsWidget.tsx", "ActionQueueWidget"],
  ["activity widget", "frontend/src/features/self-service/dashboard/MySelfServiceActivityWidget.tsx", "TimelineWidget"],
  ["backend service", "src/modules/self-service/self-service.service.ts", "modern_widgets"],
  ["backend service", "src/modules/self-service/self-service.service.ts", "quick_actions"],
  ["backend service", "src/modules/self-service/self-service.service.ts", "attendanceCalendarService.getSelfAttendanceCalendar"],
  ["backend service", "src/modules/self-service/self-service.service.ts", "requireLinkedEmployeeForSelfService(profile)"],
  ["backend repository", "src/modules/self-service/self-service.repository.ts", "listUpcomingRosterShifts"],
  ["backend repository", "src/modules/self-service/self-service.repository.ts", "listOwnDisciplinaryAcknowledgements"],
  ["backend repository", "src/modules/self-service/self-service.repository.ts", "listSelfRecentActivity"],
  ["self routes", "src/routes/self-service.routes.ts", "requireLinkedEmployeeForSelfService"],
  ["navigation", "frontend/src/lib/navigation.ts", "requiresLinkedEmployee: true"],
  ["tests", "tests/employee-self-service-dashboard.test.ts", "modern self-service dashboard"],
  ["tests", "tests/employee-self-service-dashboard.test.ts", "standalone Super Admin"],
].forEach(([label, path, token]) => mustInclude(label, path, token));

const frontendSource = [
  "frontend/src/features/self-service/EmployeeDashboardPage.tsx",
  "frontend/src/features/self-service/dashboard/SelfServiceCommandHeader.tsx",
  "frontend/src/features/self-service/dashboard/MyAttendanceTodayWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyAttendanceCalendarPreviewWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyLeaveBalanceWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyUpcomingRosterWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyPendingRequestsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyDocumentsKycWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyPayslipsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyApprovalsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyOffboardingStatusWidget.tsx",
  "frontend/src/features/self-service/dashboard/MyAcknowledgementsWidget.tsx",
  "frontend/src/features/self-service/dashboard/MySelfServiceActivityWidget.tsx",
].map(read).join("\n");

if (/window\.alert\s*\(|\balert\s*\(/.test(frontendSource)) failures.push("self-service dashboard reintroduced browser alert().");
if (/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource)) failures.push("self-service dashboard reintroduced browser confirm().");
if (/dark:\s*|darkMode|ThemeProvider/.test(frontendSource)) failures.push("self-service dashboard introduced dark mode patterns.");

if (failures.length) {
  console.error("Self-service dashboard modernization verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Self-service dashboard modernization verification passed.");
