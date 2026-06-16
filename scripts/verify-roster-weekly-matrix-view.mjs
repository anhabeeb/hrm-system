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

const routes = read("src/routes/rosters.routes.ts");
const service = read("src/modules/rosters/roster-weekly-matrix.service.ts");
const repository = read("src/modules/rosters/roster-weekly-matrix.repository.ts");
const controller = read("src/modules/rosters/roster-weekly-matrix.controller.ts");
const validators = read("src/modules/rosters/roster-weekly-matrix.validators.ts");
const types = read("src/modules/rosters/roster-weekly-matrix.types.ts");
const page = read("frontend/src/features/roster-matrix/RosterWeeklyMatrixPage.tsx");
const matrix = read("frontend/src/features/roster-matrix/RosterWeeklyMatrix.tsx");
const dayCell = read("frontend/src/features/roster-matrix/RosterDayCell.tsx");
const editor = read("frontend/src/features/roster-matrix/RosterCellEditorDrawer.tsx");
const conflictPanel = read("frontend/src/features/roster-matrix/RosterConflictPanel.tsx");
const bulkDialog = read("frontend/src/features/roster-matrix/RosterBulkAssignDialog.tsx");
const copyDialog = read("frontend/src/features/roster-matrix/RosterCopyWeekDialog.tsx");
const rosterPage = read("frontend/src/features/rosters/RostersPage.tsx");
const api = read("frontend/src/features/roster-matrix/rosterWeeklyMatrix.api.ts");
const tests = read("tests/roster-weekly-matrix-view.test.ts");
const navigation = read("frontend/src/lib/navigation.ts");
const router = read("frontend/src/app/router.tsx");

includesAll(routes, [
  '"/weekly-matrix"',
  '"/weekly-matrix/employees"',
  '"/weekly-matrix/shifts"',
  '"/weekly-matrix/validate"',
  '"/weekly-matrix/save-draft"',
  '"/weekly-matrix/submit"',
  '"/weekly-matrix/apply"',
  'requireFeature("employee_management")',
  "rosters.weeklyMatrix.viewTeam",
  "roster.changes.createForOthers",
], "Roster weekly matrix routes");

includesAll(service, [
  "getRosterWeeklyMatrix",
  "getRosterMatrixEmployees",
  "getRosterMatrixShifts",
  "validateRosterMatrixChanges",
  "detectRosterConflicts",
  "submitRosterMatrixChanges",
  "saveRosterMatrixDraft",
  "applyRosterMatrixChanges",
  "copyPreviousWeekRoster",
  "bulkAssignRosterMatrix",
  "assertCanOverrideRosterMatrixConflicts",
  "createRosterChangeRequest",
  "submitRosterChangeForApproval",
  "ROSTER_CHANGE",
  "EMPLOYEE_NOT_ACTIVE",
  "DOUBLE_BOOKED",
  "EMPLOYEE_ON_LEAVE",
  "ROSTER_MATRIX_CONFLICT_OVERRIDE_SUBMITTED",
  "DRAFT_ONLY_ASSIGN_MESSAGE",
  "listAttendanceOverlaysForRosterMatrix",
], "Roster weekly matrix service");

includesAll(repository, [
  "listRosterMatrixEmployees",
  "listRosterMatrixShifts",
  "listRosterMatrixAssignments",
  "listPendingRosterMatrixChanges",
  "listApprovedLeavesForRosterMatrix",
  "listHolidaysForRosterMatrix",
  "listOpenRosterMatrixConflicts",
  "listAttendanceOverlaysForRosterMatrix",
], "Roster weekly matrix repository");

includesAll(controller + validators + types, [
  "validateRosterWeeklyMatrixQuery",
  "validateRosterMatrixChangePayload",
  "RosterMatrixStatus",
  "SHIFT_ASSIGNED",
  "PENDING_CHANGE",
  "DOUBLE_BOOKED",
], "Roster weekly matrix backend contract");

[
  "RosterWeeklyMatrixPage.tsx",
  "RosterWeeklyMatrix.tsx",
  "RosterDayCell.tsx",
  "RosterCellEditorDrawer.tsx",
  "RosterConflictPanel.tsx",
  "RosterBulkAssignDialog.tsx",
  "RosterCopyWeekDialog.tsx",
  "RosterMatrixToolbar.tsx",
  "RosterMatrixLegend.tsx",
  "RosterShiftSelect.tsx",
  "rosterWeeklyMatrix.api.ts",
  "rosterWeeklyMatrix.types.ts",
  "rosterWeeklyMatrix.utils.ts",
].forEach((path) => ensure(existsSync(resolve(root, "frontend/src/features/roster-matrix", path)), `Missing frontend roster matrix component ${path}`));

includesAll(page + matrix + dayCell + editor + conflictPanel + bulkDialog + copyDialog, [
  "WidgetCard",
  "RosterWeeklyMatrix",
  "RosterCellEditorDrawer",
  "RosterConflictPanel",
  "RosterBulkAssignDialog",
  "RosterCopyWeekDialog",
  "onStageChanges",
], "Roster weekly matrix frontend");
includesAll(rosterPage, ["weekly-matrix", "RosterWeeklyMatrixPage"], "Roster page tab integration");
includesAll(api, ["/rosters/weekly-matrix", "saveDraft", "submit", "copyPreviousWeek", "bulkAssign"], "Roster weekly matrix API client");
includesAll(navigation + router, ["requiredFeaturesAll", "employee_management", "rosters.weeklyMatrix.view"], "Roster weekly matrix navigation guards");

ensure(!/alert\s*\(/.test(page + matrix + dayCell + editor + conflictPanel + bulkDialog + copyDialog), "Browser alert() usage found in roster weekly matrix frontend.");
ensure(!/confirm\s*\(/.test(page + matrix + dayCell + editor + conflictPanel + bulkDialog + copyDialog), "Browser confirm() usage found in roster weekly matrix frontend.");
ensure(!/dark:|darkMode|ThemeProvider/.test(page + matrix + dayCell + editor + conflictPanel + bulkDialog + copyDialog), "Dark mode implementation found in roster weekly matrix frontend.");
ensure(!/drag|drop/i.test(page + matrix + editor), "Full drag/drop roster editing appears to have been added in Phase 6.");
ensure(!/attendance_overlay:\s*attendanceEnabled\s*\?\s*null\s*:\s*null/.test(service), "attendance_overlay is permanently hardcoded null.");
ensure(!/if\s*\(\s*change\.action\s*!==\s*"ASSIGN_SHIFT"[\s\S]{0,120}continue;/.test(service), "saveRosterMatrixDraft appears to silently ignore non-ASSIGN_SHIFT actions.");
ensure(!/override_conflicts/.test(service) || service.includes("assertCanOverrideRosterMatrixConflicts"), "override_conflicts is used without explicit override permission helper.");
ensure(!/Select cells in the matrix, choose a shift in the cell editor/.test(bulkDialog), "Bulk assign dialog still contains placeholder workflow text.");

includesAll(tests, [
  "weekly matrix endpoint requires auth",
  "disabled roster module blocks route",
  "manager can view own department lower-level employees",
  "leave conflict detected",
  "double booking detected",
  "submit creates roster change request",
  "no override permission cannot use override_conflicts",
  "override permission can override warning-level conflict",
  "critical conflicts remain blocked",
  "override reason is required",
  "save draft CHANGE_SHIFT does not silently succeed",
  "save draft CLEAR_SHIFT does not silently succeed",
  "save draft MARK_DAY_OFF does not silently succeed",
  "bulk assign validates conflicts",
  "missing punch returns warning overlay",
  "Roster Weekly Matrix page renders",
  "no alert/confirm",
], "Roster weekly matrix tests");

if (failures.length) {
  console.error("Roster weekly matrix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Roster weekly matrix verification passed.");
