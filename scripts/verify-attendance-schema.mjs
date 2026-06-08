import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = [
  readFileSync(resolve(root, "migrations/0034_attendance_rule_hardening.sql"), "utf8"),
  readFileSync(resolve(root, "migrations/0035_biometric_device_hardening.sql"), "utf8"),
].join("\n").toLowerCase();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const summaryService = readFileSync(resolve(root, "src/modules/attendance/attendance-summary.service.ts"), "utf8");
const attendanceRepository = readFileSync(resolve(root, "src/modules/attendance/attendance.repository.ts"), "utf8");
const classifier = readFileSync(resolve(root, "src/modules/attendance/attendance-classification.service.ts"), "utf8");
const settingsUi = readFileSync(resolve(root, "frontend/src/features/settings/structured-settings.ts"), "utf8");

const requiredMigrationTokens = [
  "alter table attendance_daily_summary add column expected_start",
  "alter table attendance_daily_summary add column expected_end",
  "alter table attendance_daily_summary add column classification",
  "alter table attendance_daily_summary add column absence_minutes",
  "alter table attendance_daily_summary add column warnings_json",
  "alter table attendance_daily_summary add column source_references_json",
  "alter table attendance_daily_summary add column calculated_at",
  "alter table attendance_daily_summary add column correction_applied_id",
  "alter table attendance_conflicts add column attendance_date",
  "alter table attendance_conflicts add column severity",
  "idx_attendance_summary_company_classification",
  "idx_attendance_conflicts_company_date_status",
  "alter table attendance_events add column source_device_id",
  "alter table attendance_events add column source_event_id",
  "alter table attendance_events add column metadata_json",
];

for (const token of requiredMigrationTokens) {
  if (!migration.includes(token)) {
    throw new Error(`Attendance schema verification failed: missing ${token}`);
  }
}

const requiredClassifierTokens = [
  "classifyEmployeeAttendanceDay",
  "rosterShift",
  "approvedLeave",
  "missing_attendance_counts_as_absent",
  "overtime_requires_approval",
  "late_and_early_checkout",
  "rule_conflicts",
  "attendance_on_leave",
  "attendance_outside_roster",
  "missing_roster",
];

for (const token of requiredClassifierTokens) {
  if (!classifier.includes(token)) {
    throw new Error(`Attendance schema verification failed: classifier missing ${token}`);
  }
}

if (!summaryService.includes("findRosterShiftForAttendanceDate") || !summaryService.includes("findApprovedLeaveForDate")) {
  throw new Error("Attendance schema verification failed: summary rebuild does not load roster/leave context.");
}

if (!summaryService.includes("findOpenAttendanceRuleConflict") || !summaryService.includes("createAttendanceRuleConflict")) {
  throw new Error("Attendance schema verification failed: summary rebuild does not persist rule conflicts idempotently.");
}

for (const token of ["source_device_id", "source_event_id", "metadata_json"]) {
  if (!attendanceRepository.includes(token)) {
    throw new Error(`Attendance schema verification failed: createAttendanceEvent does not write ${token}.`);
  }
}

for (const setting of ["grace_period_minutes", "missed_punch_policy", "require_roster_for_attendance", "default_shift_start_time"]) {
  if (!settingsUi.includes(setting)) {
    throw new Error(`Attendance schema verification failed: settings UI missing ${setting}`);
  }
}

if (!packageJson.scripts?.["verify:attendance-schema"]) {
  throw new Error("Attendance schema verification failed: missing verify:attendance-schema package script.");
}

console.log("Attendance schema verification passed.");
