import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const includes = (label, text, token) => {
  assert(text.includes(token), `${label} missing ${token}`);
};

const migrationPath = "migrations/0064_roster_change_approval_engine.sql";
assert(existsSync(resolve(root, migrationPath)), "roster change approval migration is missing.");
const migration = existsSync(resolve(root, migrationPath)) ? read(migrationPath) : "";
[
  "CREATE TABLE IF NOT EXISTS roster_change_requests",
  "approval_request_id",
  "approval_status",
  "approval_current_step",
  "FAILED_TO_APPLY",
  "idx_roster_change_requests_approval",
  "idx_roster_change_requests_employee",
  "idx_roster_change_requests_department",
].forEach((token) => includes("roster change migration", migration, token));

const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "MODULE_BOUND_ROSTER_CHANGE_ACTION_MESSAGE",
  "Roster changes must be approved from the Roster module",
  "request.operation_type === \"ROSTER_CHANGE\"",
  "options.moduleOperationType === \"ROSTER_CHANGE\"",
  "input.operation_type === \"ROSTER_CHANGE\"",
  "roster.changes.createForOthers",
  "roster.changes.cancel",
  "roster.changes.cancelAny",
  "allowModuleBoundAction",
].forEach((token) => includes("approval engine roster safety", approvalService, token));

const service = read("src/modules/rosters/rosters.service.ts");
[
  "ROSTER_CHANGE_OPERATION",
  "assertRosterChangeSubjectAllowed",
  "isGlobalRosterChangeManager",
  "lower-level employees",
  "buildRosterChangeVisibilityFilter",
  "assertCanViewRosterChange",
  "approvalEngineService.getTimeline",
  "prevalidateRosterChangeApplication",
  "findDuplicatePendingRosterChange",
  "createApprovalRequestDraft",
  "modulePermission: \"roster.changes.createForOthers\"",
  "moduleOperationType: ROSTER_CHANGE_OPERATION",
  "submitApprovalRequest",
  "already_submitted: true",
  "approveStep(env, context, change.approval_request_id",
  "rejectStep(env, context, change.approval_request_id",
  "cancelRequest(env, context, change.approval_request_id",
  "moduleCancelPermission: \"roster.changes.cancel\"",
  "moduleCancelAnyPermission: \"roster.changes.cancelAny\"",
  "updateRosterShiftForEmployee",
  "cancelRosterShiftForEmployee",
  "FAILED_TO_APPLY",
  "roster_change_apply_failed",
  "getRosterChangeApprovalTimeline",
].forEach((token) => includes("roster service approval integration", service, token));

const repository = read("src/modules/rosters/rosters.repository.ts");
[
  "findEmployeeByUserId",
  "updateRosterShiftForEmployee",
  "employee_id = ?",
  "cancelRosterShiftForEmployee",
  "listRosterChanges",
  "findRosterChangeById",
  "findDuplicatePendingRosterChange",
  "updateRosterChangeApprovalLink",
  "updateRosterChangeStatus",
].forEach((token) => includes("roster repository approval integration", repository, token));

const routes = read("src/routes/rosters.routes.ts");
[
  "/changes",
  "/changes/:id/submit",
  "/changes/:id/approve",
  "/changes/:id/reject",
  "/changes/:id/cancel",
  "/changes/:id/approval-timeline",
  "roster.changes.createForOthers",
  "approvals.department.approve",
  "approvals.hrFinal.approve",
].forEach((token) => includes("roster routes", routes, token));

const permissions = read("seeds/permissions.seed.sql");
[
  "roster.changes.view",
  "roster.changes.create",
  "roster.changes.createForOthers",
  "roster.changes.cancel",
  "roster.changes.cancelAny",
  "roster.changes.audit.view",
].forEach((token) => includes("permission seed", permissions, token));

const frontendApprovals = read("frontend/src/features/approvals/ApprovalsPage.tsx");
[
  "operation_type === \"ROSTER_CHANGE\"",
  "rostersApi.approveChange",
  "rostersApi.rejectChange",
  "rostersApi.cancelChange",
].forEach((token) => includes("frontend generic approvals roster action path", frontendApprovals, token));

const frontendRosterApi = read("frontend/src/features/rosters/rosters.api.ts");
[
  "listChanges",
  "createChange",
  "submitChange",
  "approveChange",
  "rejectChange",
  "cancelChange",
  "changeTimeline",
].forEach((token) => includes("frontend roster API", frontendRosterApi, token));

const frontendRostersPage = read("frontend/src/features/rosters/RostersPage.tsx");
[
  "Change Requests",
  "RosterChangeRequestDialog",
  "rostersApi.listChanges",
  "rostersApi.changeTimeline",
  "rostersApi.approveChange",
  "rostersApi.rejectChange",
  "rostersApi.cancelChange",
  "canApproveChange",
  "canRejectChange",
  "canCancelChange",
  "Approval timeline",
  "useToast",
].forEach((token) => includes("frontend roster change page", frontendRostersPage, token));

const frontendRosterDialog = read("frontend/src/features/rosters/RosterChangeRequestDialog.tsx");
[
  "rostersApi.createChange",
  "rostersApi.submitChange",
  "currentEmployeeId",
  "canSelectEmployee",
  "Your roster change request has been submitted for approval.",
  "SHIFT_TIME_CHANGE",
  "SHIFT_SWAP",
  "DAY_OFF_REQUEST",
  "GENERAL_ROSTER_CHANGE",
].forEach((token) => includes("frontend roster change request dialog", frontendRosterDialog, token));

const selfServicePage = read("frontend/src/features/self-service/SelfServiceModulePage.tsx");
[
  "RosterChangeRequestDialog",
  "moduleKey === \"roster\"",
  "currentEmployeeId={auth.user?.employee_id ?? null}",
  "canSelectEmployee={false}",
].forEach((token) => includes("self-service roster change entry", selfServicePage, token));

const testsPath = "tests/roster-change-approval-integration.test.ts";
assert(existsSync(resolve(root, testsPath)), "roster change approval integration tests are missing.");
const tests = existsSync(resolve(root, testsPath)) ? read(testsPath) : "";
[
  "creates a ROSTER_CHANGE approval request",
  "frontend create/submit flow uses rostersApi.createChange and rostersApi.submitChange",
  "blocks a normal employee from creating a roster change for another employee",
  "allows a department manager to create for a lower-level same-department employee",
  "blocks a department manager from creating for another department",
  "blocks a department manager from creating for a same or higher-level employee",
  "allows HR final approver to view HR-final roster change timeline only when approval visibility allows it",
  "blocks HR final approver from unrelated non-HR-final roster change detail",
  "blocks normal employee from viewing coworker roster change detail",
  "frontend roster page permission-gates roster change actions",
  "allows HR with roster.changes.createForOthers",
  "does not create duplicate approval requests on repeated submit",
  "uses an employee-safe roster shift update",
  "marks roster change FAILED_TO_APPLY",
  "builds row-level visibility",
  "rejects sensitive roster change payload keys",
  "ApprovalsPage.tsx",
].forEach((token) => includes("roster change approval tests", tests, token));

const frontendSource = frontendApprovals + frontendRostersPage;
assert(!/window\.alert\s*\(|\balert\s*\(/.test(frontendSource), "roster approval frontend reintroduced browser alert().");
assert(!/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource), "roster approval frontend reintroduced browser confirm().");

console.log("Roster change approval engine verification");
console.log(`- migration: ${migrationPath}`);
console.log("- checked backend module-bound approval integration, route safety, frontend action paths, and tests");

if (failures.length > 0) {
  console.error("Roster change approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Roster change approval engine verification passed.");
