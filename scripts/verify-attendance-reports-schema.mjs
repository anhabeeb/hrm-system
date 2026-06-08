import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Attendance reports verification failed: ${message}`);
  process.exit(1);
};

const routes = read("src/routes/attendance.routes.ts");
const service = read("src/modules/attendance/attendance-reports.service.ts");
const repository = read("src/modules/attendance/attendance-reports.repository.ts");
const validator = read("src/modules/attendance/attendance-reports.validators.ts");
const reportsPage = read("frontend/src/features/attendance/AttendanceReportsPage.tsx");
const seed = read("seeds/permissions.seed.sql");
const migration = read("migrations/0036_attendance_reports.sql");

for (const route of [
  '"/reports/daily"',
  '"/reports/monthly"',
  '"/reports/employee/:employeeId"',
  '"/reports/exceptions"',
  '"/reports/device-punches"',
  '"/reports/summary"',
]) {
  if (!routes.includes(route)) fail(`missing attendance report route ${route}`);
}

for (const permission of [
  "attendance.reports.view",
  "attendance.reports.export_preview",
  "attendance.exceptions.view",
  "attendance.device_punches.view",
]) {
  if (!routes.includes(permission) && permission !== "attendance.reports.export_preview") {
    fail(`route does not enforce ${permission}`);
  }
  if (!seed.includes(permission)) fail(`permission ${permission} is not seeded`);
}

for (const index of [
  "idx_attendance_events_company_source_device_time",
  "idx_attendance_events_company_employee_event_time",
  "idx_biometric_logs_company_device_timestamp",
  "idx_biometric_logs_company_status_timestamp",
  "idx_attendance_corrections_company_employee_status",
]) {
  if (!migration.includes(index)) fail(`missing report index ${index}`);
}

for (const token of [
  "attendance_daily_summary",
  "source_device_id",
  "source_event_id",
  "metadata_json",
  "biometric_attendance_logs",
  "attendance_conflicts",
  "roster_shifts",
]) {
  if (!repository.includes(token) && !service.includes(token)) {
    fail(`report layer does not reference ${token}`);
  }
}

for (const scopedToken of [
  "scopedSubqueryWhere",
  "applyOutletScope(clauses, values, alias",
  "`${alias}.outlet_id IN",
  "COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10))",
  "substr(COALESCE(bl.device_timestamp, bl.event_time), 1, 10)",
]) {
  if (!repository.includes(scopedToken)) {
    fail(`summary report subquery scoping is missing ${scopedToken}`);
  }
}

for (const scheduledToken of [
  "total_scheduled_minutes",
  "rs.status IN ('published', 'completed')",
  "shiftMinutesExpression",
  "THEN 1440 ELSE 0 END",
]) {
  if (!repository.includes(scheduledToken)) {
    fail(`monthly scheduled-hours query is missing ${scheduledToken}`);
  }
}

if (!reportsPage.includes("total_scheduled_minutes")) {
  fail("frontend monthly report does not display scheduled time");
}

if (!reportsPage.includes("firstNumber(summary")) {
  fail("frontend summary cards do not use safe first-defined metric fallback");
}

if (reportsPage.includes('summaryNumber(summary, "days_present") ||')) {
  fail("frontend summary cards still use unsafe zero-string fallback");
}

if (!reportsPage.includes("Source event details") || !reportsPage.includes("source_event_id")) {
  fail("employee detail report does not expose compact source event details");
}

if (!validator.includes("requires a bounded date range")) {
  fail("report validators do not prevent unbounded report scans");
}

for (const forbidden of ["device_token_hash", "api_token_hash", "raw_payload_json AS"]) {
  if (repository.includes(forbidden)) fail(`report repository may expose ${forbidden}`);
}

console.log("Attendance reports schema verification passed.");
