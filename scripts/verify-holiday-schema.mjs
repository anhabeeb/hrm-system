import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Holiday verification failed: ${message}`);
  process.exit(1);
};
const ensure = (path) => {
  if (!existsSync(resolve(root, path))) fail(`missing ${path}`);
  return read(path);
};

const migration = ensure("migrations/0041_holiday_calendar_hardening.sql");
const routes = ensure("src/routes/holidays.routes.ts");
const app = ensure("src/app.ts");
const service = ensure("src/modules/holidays/holidays.service.ts");
const calculator = ensure("src/modules/holidays/holiday-calculation.service.ts");
const repository = ensure("src/modules/holidays/holidays.repository.ts");
const permissions = ensure("seeds/permissions.seed.sql");
const leaveService = ensure("src/modules/leave/leave.service.ts");
const leaveRepo = ensure("src/modules/leave/leave.repository.ts");
const attendanceSummary = ensure("src/modules/attendance/attendance-summary.service.ts");
const attendanceRepo = ensure("src/modules/attendance/attendance.repository.ts");
const rosterService = ensure("src/modules/rosters/rosters.service.ts");
const rosterRepo = ensure("src/modules/rosters/rosters.repository.ts");
const longLeaveCalculator = ensure("src/modules/long-leave/long-leave-calculator.service.ts");
const longLeaveRepo = ensure("src/modules/long-leave/long-leave.repository.ts");
const frontendPage = ensure("frontend/src/features/holidays/HolidayCalendarPage.tsx");
const frontendApi = ensure("frontend/src/features/holidays/holidays.api.ts");
const router = ensure("frontend/src/app/router.tsx");
const nav = ensure("frontend/src/lib/navigation.ts");
const tests = ensure("tests/holidays.test.ts");
const leaveTests = ensure("tests/leave.test.ts");
const rosterTests = ensure("tests/rosters.test.ts");
const longLeaveTests = ensure("tests/long-leave.test.ts");

for (const token of [
  "ALTER TABLE holidays ADD COLUMN code",
  "ALTER TABLE holidays ADD COLUMN date",
  "ALTER TABLE holidays ADD COLUMN status",
  "ALTER TABLE holidays ADD COLUMN applies_to_local_employees",
  "ALTER TABLE holidays ADD COLUMN applies_to_foreign_employees",
  "ALTER TABLE holidays ADD COLUMN affects_long_leave_payroll",
  "ALTER TABLE holiday_settings ADD COLUMN optional_holidays_enabled",
  "ALTER TABLE holiday_settings ADD COLUMN exclude_holidays_from_paid_leave",
  "idx_holidays_company_code_unique",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

for (const route of [
  '"/holidays"',
  'holidaysRoutes.get("/",',
  'holidaysRoutes.post("/",',
  'patch("/:id"',
  '"/:id/archive"',
  '"/:id/restore"',
  '"/calendar"',
  '"/range"',
  '"/check-date"',
  '"/bulk-import"',
  '"/bulk-upsert"',
  '"/settings"',
  'patch("/settings"',
]) {
  if (!routes.includes(route) && !app.includes(route)) fail(`route missing ${route}`);
}

for (const permission of [
  "holidays.view",
  "holidays.create",
  "holidays.edit",
  "holidays.archive",
  "holidays.restore",
  "holidays.import",
  "holidays.settings.manage",
  "holidays.calendar.view",
  "holidays.override",
  "holidays.audit.view",
]) {
  if (!permissions.includes(permission)) fail(`permission ${permission} is not seeded`);
  if (!routes.includes(permission) && !frontendPage.includes(permission) && !nav.includes(permission)) {
    fail(`permission ${permission} is not enforced or frontend guarded`);
  }
}

for (const token of [
  "getHolidaysForRange",
  "getHolidayDatesForEmployee",
  "isHolidayForEmployee",
  "calculateLeaveWorkingDays",
  "calculateLongLeavePayableHolidayDays",
  "classifyAttendanceHolidayContext",
  "expandHolidayRows",
  "is_recurring",
  "applies_to_foreign_employees",
]) {
  if (!calculator.includes(token) && !service.includes(token)) fail(`holiday calculation service missing ${token}`);
}

if (!leaveService.includes("holidayCalculation.calculateLeaveWorkingDays") || !leaveService.includes("holidays_exclude_from_paid_leave") && !calculator.includes("holidays_exclude_from_paid_leave")) {
  fail("real leave request duration does not use shared paid/unpaid holiday calculation");
}
if (!calculator.includes("holidays_exclude_from_unpaid_leave") || !calculator.includes("exclude_holidays_from_leave")) {
  fail("leave holiday calculation is missing new paid/unpaid settings or legacy fallback");
}
if (!attendanceSummary.includes("classifyAttendanceHolidayContext") || !attendanceSummary.includes("holiday_attendance_rules_enabled") && !calculator.includes("holiday_attendance_rules_enabled")) {
  fail("attendance summary does not use shared holiday context/settings");
}
if (!rosterService.includes("holidayCalculation.getHolidaysForRange") || !rosterService.includes("holiday_roster_warning") || !rosterService.includes("holiday_roster_blocked")) {
  fail("roster holiday conflict check does not use shared holiday context and hardened conflict types");
}
if (!longLeaveCalculator.includes("calculateLongLeavePayableHolidayDays") || !longLeaveCalculator.includes("holiday_days") || !longLeaveCalculator.includes("payable_holiday_days")) {
  fail("long-leave payroll preview does not use shared holiday context/counts");
}
if (!calculator.includes("department_id: employee?.department_id") || !calculator.includes("appliesToDepartment")) {
  fail("department_id exists in holiday schema but is ignored by employee-specific holiday calculations");
}
if (!leaveRepo.includes("COALESCE(h.affects_leave_duration, h.affects_leave")) fail("legacy leave holiday lookup ignores hardened holiday leave flag");
if (!attendanceRepo.includes("affects_attendance_absence")) fail("attendance holiday context hook is missing hardened attendance flag");
if (!rosterRepo.includes("findHolidayOnDate") || !rosterRepo.includes("COALESCE(h.affects_roster")) fail("legacy roster holiday compatibility query is missing");
if (!longLeaveRepo.includes("affects_long_leave_payroll")) fail("legacy long-leave holiday compatibility query is missing");
if (!repository.includes("findDuplicateActiveHoliday")) fail("duplicate active holiday protection missing");

for (const token of [
  "Holiday Calendar",
  "Holiday Calendar Settings",
  "New holiday",
  "Archive",
  "Restore",
  "Affects leave duration",
  "Affects attendance absence",
  "Affects long-leave payroll",
]) {
  if (!frontendPage.includes(token)) fail(`frontend holiday page missing ${token}`);
}
if (!frontendApi.includes("/holidays/settings") || !frontendApi.includes("/holidays/calendar")) fail("frontend holiday API missing settings/calendar endpoints");
if (!router.includes("HolidayCalendarPage") || !nav.includes("Holiday Calendar")) fail("holiday frontend route/nav is missing");
if (/dark:/i.test(frontendPage)) fail("holiday frontend page introduces dark mode styles");

if (tests.includes("it.todo")) fail("Phase 9D-critical holiday tests still contain it.todo placeholders");
for (const token of [
  "create holiday",
  "duplicate code blocked per company",
  "range expands multi-day holiday",
  "range expands recurring yearly holiday",
  "outlet-specific holiday applies only to matching outlet",
  "local-only holiday applies only to local employees",
  "foreign-only holiday applies only to foreign employees",
  "inactive holiday ignored in calculations",
  "leave duration excludes holiday when policy says exclude",
  "leave duration includes holiday when policy says include",
  "long-leave payable holiday days change with settings",
  "Holiday Calendar route/page exists",
  "settings panel exists",
  "attendance summary/classification on holiday becomes holiday/excused instead of absent",
  "attendance summary ignores holiday when holiday_attendance_rules_enabled is disabled",
  "department-specific holiday affects only matching department where supported",
]) {
  if (!tests.includes(token)) fail(`missing Phase 9D test: ${token}`);
}

for (const token of [
  "actual leave request create/reservation excludes holiday from balance deduction when policy says exclude",
  "actual leave request includes holiday when policy says include",
  "local/foreign outlet and department applicability affects real leave request duration",
]) {
  if (!leaveTests.includes(token)) fail(`missing real leave behavior test: ${token}`);
}

for (const token of [
  "holiday warning blocks without override",
  "holiday warning allows with override and persists warning conflict",
  "roster creation on recurring holiday is blocked when holiday scheduling is disabled",
  "holiday_roster_blocked",
]) {
  if (!rosterTests.includes(token)) fail(`missing real roster holiday behavior test: ${token}`);
}

for (const token of [
  "long-leave payroll preview uses shared recurring holiday context",
  "local-only holiday does not apply to a foreign employee in long-leave payroll preview",
  "foreign-only holiday applies to a foreign employee in long-leave payroll preview",
  "holiday_days",
  "payable_holiday_days",
]) {
  if (!longLeaveTests.includes(token)) fail(`missing real long-leave holiday behavior test: ${token}`);
}

console.log("Holiday schema verification passed.");
