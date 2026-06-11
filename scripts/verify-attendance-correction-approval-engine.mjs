import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const warnings = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const includes = (label, text, token) => {
  assert(text.includes(token), `${label} missing ${token}`);
};

const migrationPath = "migrations/0063_attendance_correction_approval_engine.sql";
assert(existsSync(resolve(root, migrationPath)), "attendance correction approval migration is missing.");
const migration = existsSync(resolve(root, migrationPath)) ? read(migrationPath) : "";
[
  "approval_request_id",
  "approval_status",
  "approval_current_step",
  "idx_attendance_corrections_company_approval_request",
  "idx_attendance_corrections_active_approval_request",
].forEach((token) => includes("attendance correction migration", migration, token));

const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "MODULE_BOUND_ATTENDANCE_CORRECTION_ACTION_MESSAGE",
  "request.operation_type === \"ATTENDANCE_CORRECTION\"",
  "options.moduleOperationType === \"ATTENDANCE_CORRECTION\"",
  "input.operation_type === \"ATTENDANCE_CORRECTION\"",
  "attendance.corrections.createForOthers",
  "moduleCancelPermission",
  "attendance.corrections.cancel",
  "attendance.corrections.cancelAny",
  "allowModuleBoundAction",
].forEach((token) => includes("approval engine service", approvalService, token));

const attendanceService = read("src/modules/attendance/attendance.service.ts");
[
  "ATTENDANCE_CORRECTION_OPERATION",
  "assertAttendanceEventBelongsToEmployee",
  "event.employee_id !== input.employeeId",
  "validateCorrectionApplyReadiness",
  "assertSafeCorrectionPayload",
  "SUPPORTED_CORRECTION_TYPES",
  "canCreateAttendanceCorrectionForEmployee",
  "findDuplicatePendingCorrection",
  "createApprovalRequestDraft",
  "modulePermission: \"attendance.corrections.createForOthers\"",
  "moduleOperationType: ATTENDANCE_CORRECTION_OPERATION",
  "submitApprovalRequest",
  "approveStep(env, context, correction.approval_request_id",
  "rejectStep(env, context, correction.approval_request_id",
  "cancelRequest(env, context, correction.approval_request_id",
  "allowModuleBoundAction: true",
  "moduleCancelPermission: \"attendance.corrections.cancel\"",
  "moduleCancelAnyPermission: \"attendance.corrections.cancelAny\"",
  "canViewAttendanceCorrection",
  "buildAttendanceCorrectionVisibilityFilter",
  "FAILED_TO_APPLY",
  "attendance_correction_apply_failed",
  "getCorrectionApprovalTimeline",
].forEach((token) => includes("attendance service approval integration", attendanceService, token));

const attendanceRepository = read("src/modules/attendance/attendance.repository.ts");
[
  "findEmployeeByUserId",
  "employee_id = ? AND id = ?",
  "updateCorrectionApprovalLink",
  "updateCorrectionApprovalStatus",
  "findDuplicatePendingCorrection",
  "approval_current_step_name",
  "visibilityExtra",
].forEach((token) => includes("attendance repository approval integration", attendanceRepository, token));

const routes = read("src/routes/attendance.routes.ts");
[
  "/corrections/:id/approval-timeline",
  "/corrections/:id/cancel",
  "attendance.corrections.createForOthers",
  "approvals.department.approve",
  "approvals.hrFinal.approve",
].forEach((token) => includes("attendance routes", routes, token));

const permissions = read("seeds/permissions.seed.sql");
[
  "attendance.corrections.view",
  "attendance.corrections.create",
  "attendance.corrections.createForOthers",
  "attendance.corrections.cancelAny",
  "attendance.corrections.audit.view",
].forEach((token) => includes("permission seed", permissions, token));

const frontendApprovals = read("frontend/src/features/approvals/ApprovalsPage.tsx");
[
  "operation_type === \"ATTENDANCE_CORRECTION\"",
  "attendanceApi.approveCorrection",
  "attendanceApi.rejectCorrection",
  "attendanceApi.cancelCorrection",
].forEach((token) => includes("frontend generic approvals attendance action path", frontendApprovals, token));

const frontendAttendance = read("frontend/src/features/attendance/AttendanceCorrectionsPage.tsx");
[
  "useToast",
  "approval_current_step_name",
  "canCreateForOthers",
  "currentEmployeeId={auth.user?.employee_id ?? null}",
  "attendanceApi.cancelCorrection",
  "attendanceApi.getCorrectionTimeline",
  "timelineQuery",
  "Approval timeline",
].forEach((token) => includes("frontend attendance correction page", frontendAttendance, token));

const dialog = read("frontend/src/features/attendance/CorrectionRequestDialog.tsx");
[
  "canSelectEmployee",
  "Your employee profile is not linked to this login. Please contact HR.",
  "currentEmployeeId",
].forEach((token) => includes("attendance correction dialog self-service gating", dialog, token));

const tests = read("tests/attendance-correction-approval-integration.test.ts");
[
  "creates an ATTENDANCE_CORRECTION approval request",
  "blocks a normal employee from creating a correction for another employee",
  "rejects attendance_event_id when it belongs to another employee",
  "rejects sensitive payload keys and unsupported correction types before approval creation",
  "rejects invalid requested time before approval creation",
  "uses an employee-safe event update and rechecks event ownership during final apply",
  "marks correction FAILED_TO_APPLY and audits if final apply fails after approval",
  "builds row-level visibility so normal employees do not list same-outlet coworkers",
  "createForOthers",
  "does not apply the attendance change after department approval",
  "applies the attendance correction only after HR final approval",
  "cancels the linked approval request",
].forEach((token) => includes("attendance correction approval tests", tests, token));

const approvalTests = read("tests/approval-workflow-engine.test.ts");
[
  "Attendance corrections must be approved from the Attendance module",
  "attendance.corrections.createForOthers",
  "allows attendance module-bound own cancellation without broad approval cancel permission only for attendance corrections",
  "moduleOperationType: \"ATTENDANCE_CORRECTION\"",
].forEach((token) => includes("approval engine attendance safety tests", approvalTests, token));

const frontendSource = read("frontend/src/features/attendance/AttendanceCorrectionsPage.tsx") + read("frontend/src/features/attendance/CorrectionRequestDialog.tsx");
assert(!/window\.alert\s*\(|\balert\s*\(/.test(frontendSource), "attendance correction frontend reintroduced browser alert().");
assert(!/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource), "attendance correction frontend reintroduced browser confirm().");

console.log("Attendance correction approval engine verification");
console.log(`- migration: ${migrationPath}`);
console.log("- checked backend approval integration, route safety, permissions, frontend action paths, and tests");
warnings.forEach((warning) => console.warn(`WARN ${warning}`));

if (failures.length > 0) {
  console.error("Attendance correction approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Attendance correction approval engine verification passed.");
