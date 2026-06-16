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

const backendFiles = [
  "src/modules/attendance/attendance-calendar.service.ts",
  "src/modules/attendance/attendance-calendar.repository.ts",
  "src/modules/attendance/attendance-calendar.controller.ts",
  "src/modules/attendance/attendance-calendar.types.ts",
];

const frontendFiles = [
  "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarPage.tsx",
  "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarWidget.tsx",
  "frontend/src/features/attendance-calendar/AttendanceCalendarGrid.tsx",
  "frontend/src/features/attendance-calendar/AttendanceDayCell.tsx",
  "frontend/src/features/attendance-calendar/AttendanceCalendarEmployeeSelector.tsx",
  "frontend/src/features/attendance-calendar/AttendanceCalendarLegend.tsx",
  "frontend/src/features/attendance-calendar/AttendancePayrollPeriodHeader.tsx",
  "frontend/src/features/attendance-calendar/AttendanceSummaryTiles.tsx",
  "frontend/src/features/attendance-calendar/AttendanceDayDetailDrawer.tsx",
  "frontend/src/features/attendance-calendar/attendanceCalendar.api.ts",
  "frontend/src/features/attendance-calendar/attendanceCalendar.types.ts",
  "frontend/src/features/attendance-calendar/attendanceCalendar.utils.ts",
];

for (const file of [...backendFiles, ...frontendFiles]) mustExist(file);
mustExist("tests/attendance-calendar.test.ts");

mustInclude("attendance calendar route", "src/routes/attendance.routes.ts", '"/employee-calendar"');
mustInclude("attendance calendar employee lookup route", "src/routes/attendance.routes.ts", '"/calendar-employees"');
mustInclude("employee profile calendar route", "src/routes/employees.routes.ts", '"/:employeeId/attendance-calendar"');
mustInclude("self-service calendar route", "src/routes/self-service.routes.ts", '"/attendance-calendar"');
mustInclude("payroll attendance calendar route", "src/routes/payroll.routes.ts", '"/attendance-calendar"');
mustInclude("self-service linked employee guard", "src/routes/self-service.routes.ts", "requireLinkedEmployeeForSelfService");
mustInclude("attendance feature guard", "src/routes/self-service.routes.ts", 'requireFeature("attendance")');

for (const phrase of [
  "getEmployeeAttendanceCalendar",
  "getPayrollPeriodForCalendar",
  "deriveDefaultPayrollPeriod",
  "buildCalendarDays",
  "resolveAttendanceDayStatus",
  "resolvePayrollImpact",
  "getAttendanceSummary",
  "assertCanViewEmployeeAttendanceCalendar",
  "assertCanViewSelfAttendanceCalendar",
  "OUTSIDE_PAYROLL_PERIOD",
  "NOT_ACTIVE",
  "PENDING_CORRECTION",
  "APPROVED_CORRECTION",
]) {
  mustInclude("attendance calendar service", "src/modules/attendance/attendance-calendar.service.ts", phrase);
}

for (const phrase of [
  "attendance.calendar.view",
  "attendance.calendar.viewTeam",
  "attendance.calendar.viewAll",
  "payroll.attendanceReview.view",
  "self.attendance.calendar.view",
]) {
  mustInclude("attendance calendar permissions", "seeds/permissions.seed.sql", phrase);
}

mustInclude("frontend calendar API", "frontend/src/features/attendance-calendar/attendanceCalendar.api.ts", "/attendance/employee-calendar");
mustInclude("frontend calendar employee selector API", "frontend/src/features/attendance-calendar/attendanceCalendar.api.ts", "/attendance/calendar-employees");
mustInclude("frontend self calendar API", "frontend/src/features/attendance-calendar/attendanceCalendar.api.ts", "/self/attendance-calendar");
mustInclude("frontend payroll calendar API", "frontend/src/features/attendance-calendar/attendanceCalendar.api.ts", "/payroll/attendance-calendar");
mustInclude("Employee 360 integration", "frontend/src/features/employees/Employee360Page.tsx", "EmployeeAttendanceCalendarWidget");
mustInclude("Attendance module integration", "frontend/src/features/attendance/AttendancePage.tsx", "EmployeeAttendanceCalendarWidget");
mustInclude("Payroll module integration", "frontend/src/features/payroll/PayrollPage.tsx", "EmployeeAttendanceCalendarWidget");
mustInclude("router self-service integration", "frontend/src/app/router.tsx", 'path="/self/attendance-calendar"');
mustInclude("router attendance integration", "frontend/src/app/router.tsx", 'path="/attendance/calendar"');
mustInclude("router payroll integration", "frontend/src/app/router.tsx", 'path="/payroll/attendance-review"');
mustInclude("navigation self-service calendar", "frontend/src/lib/navigation.ts", "My Attendance Calendar");
mustInclude("navigation payroll review", "frontend/src/lib/navigation.ts", "Payroll Attendance Review");
mustInclude("navigation payroll review requires attendance", "frontend/src/lib/navigation.ts", 'moduleCodesAll: ["payroll", "attendance"]');
mustInclude("navigation payroll review requires attendance feature", "frontend/src/lib/navigation.ts", 'requiredFeaturesAll: ["payroll", "attendance"]');
mustInclude("linked employee frontend guard", "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarPage.tsx", "LinkedEmployeeOnlyGuard");
mustInclude("module disabled frontend guard", "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarWidget.tsx", "ModuleDisabledGuard");
mustInclude("employee selector component", "frontend/src/features/attendance-calendar/AttendanceCalendarEmployeeSelector.tsx", "LookupCombobox");
mustInclude("employee selector component", "frontend/src/features/attendance-calendar/AttendanceCalendarEmployeeSelector.tsx", "calendarEmployees");
mustInclude("Employee 360 conditional calendar tab", "frontend/src/features/employees/Employee360Page.tsx", "canViewAttendanceCalendar");
mustInclude("Attendance page conditional calendar tab", "frontend/src/features/attendance/AttendancePage.tsx", "canViewCalendar");
mustInclude("Payroll conditional attendance review tab", "frontend/src/features/payroll/PayrollPage.tsx", "canViewAttendanceReview");

const testSource = read("tests/attendance-calendar.test.ts");
for (const phrase of [
  "calendar returns selected month days",
  "derived payroll period",
  "present day appears correctly",
  "late day appears correctly",
  "approved leave and sick leave are not marked absent",
  "pending correction appears and approved correction overrides status",
  "missing punch returns REVIEW_REQUIRED",
  "day outside active employment is not absent",
  "self-service requires linked employee",
  "standalone Super Admin",
  "manager can view lower-level same-department employee",
  "disabled Leave module hides leave overlay",
  "Search selector coming soon",
  "employee selector component exists",
  "Payroll Attendance Review nav requires both Payroll and Attendance",
  "Employee 360 Attendance Calendar tab is conditional",
  "Payroll page Attendance Review tab is conditional",
  "Attendance page Calendar tab is conditional",
]) {
  if (!testSource.includes(phrase)) failures.push(`attendance calendar tests missing ${phrase}`);
}

const frontendSource = frontendFiles.map(read).join("\n");
if (frontendSource.includes("Search selector coming soon")) failures.push("Attendance calendar still contains disabled placeholder selector text.");
if (/Employee ID/.test(read("frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarWidget.tsx"))) failures.push("Attendance calendar widget still exposes raw Employee ID input.");
if (/\b(?:window\.)?alert\s*\(/.test(frontendSource)) failures.push("Browser alert() usage introduced in attendance calendar frontend.");
if (/\b(?:window\.)?confirm\s*\(/.test(frontendSource)) failures.push("Browser confirm() usage introduced in attendance calendar frontend.");
if (/\bdarkMode\b/.test(frontendSource) || /\bdark:[\w-]/.test(frontendSource)) failures.push("Dark mode marker introduced in attendance calendar frontend.");

if (failures.length > 0) {
  console.error("Attendance calendar verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Attendance calendar verification passed.");
