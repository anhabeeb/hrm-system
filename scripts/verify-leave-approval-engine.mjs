import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustExist = (path) => {
  if (!existsSync(resolve(root, path))) failures.push(`Missing ${path}`);
};
const mustInclude = (label, text, token) => {
  if (token instanceof RegExp) {
    if (!token.test(text)) failures.push(`${label} missing ${token}`);
  } else if (!text.includes(token)) {
    failures.push(`${label} missing ${token}`);
  }
};

mustExist("migrations/0062_leave_approval_engine_integration.sql");
mustExist("tests/leave-approval-integration.test.ts");

const migration = read("migrations/0062_leave_approval_engine_integration.sql");
[
  "approval_current_step",
  "approval_submitted_at",
  "approval_completed_at",
  "department_approved_at",
  "hr_approved_at",
  "idx_leave_requests_company_approval_request",
].forEach((token) => mustInclude("leave approval engine migration", migration, token));

const service = read("src/modules/leave/leave.service.ts");
[
  "LEAVE_APPROVAL_OPERATION",
  "assertLeaveRequestSubjectAllowed",
  "canCreateLeaveForEmployee",
  "buildLeaveRequestVisibilityFilter",
  "canViewLeaveRequest",
  "createLeaveEngineApprovalDraft",
  "submitLeaveEngineApproval",
  "approvalEngineService.createApprovalRequestDraft",
  "approvalEngineService.submitApprovalRequest",
  "approvalEngineService.approveStep",
  "approvalEngineService.rejectStep",
  "approvalEngineService.cancelRequest",
  "allowModuleBoundAction",
  "allowModuleBoundCreateForOthers",
  "modulePermission: \"leave.requests.create_for_employee\"",
  "leaveSnapshotFromEngine",
  "leaveTimelineSnapshotFromEngine",
  "getMyPending",
  "already_submitted",
].forEach((token) => mustInclude("leave service approval engine integration", service, token));

if (!/createRequest[\s\S]*submitLeaveEngineApproval[\s\S]*createLeaveRequestWithBalanceTransaction/.test(service)) {
  failures.push("Leave creation must submit an engine approval request while preserving balance reservation.");
}
if (!/approveRequest[\s\S]*approvalEngineService\.approveStep[\s\S]*leave_request:\$\{request\.id\}:used/.test(service)) {
  failures.push("Leave approval must go through the approval engine and still apply final balance deduction.");
}
if (!/rejectRequest[\s\S]*approvalEngineService\.rejectStep[\s\S]*planReleasePendingBalance/.test(service)) {
  failures.push("Leave rejection must go through the approval engine and release pending balance.");
}
if (!/cancelRequest[\s\S]*approvalEngineService\.cancelRequest[\s\S]*planReleasePendingBalance/.test(service)) {
  failures.push("Pending leave cancellation must cancel the engine request and release pending balance.");
}

const routes = read("src/routes/leave.routes.ts");
[
  "approvals.department.approve",
  "approvals.hrFinal.approve",
  "approvals.financeFinal.approve",
  "approvals.requests.cancel",
  "approvals.requests.createForOthers",
].forEach((token) => mustInclude("leave routes", routes, token));

const repository = read("src/modules/leave/leave.repository.ts");
[
  "findEmployeeByUserId",
  "LeaveRequestVisibilityFilter",
  "findEngineApprovalRequestForLeave",
  "listRequestsByIds",
  "approval_current_step",
  "approval_submitted_at",
  "approval_completed_at",
].forEach((token) => mustInclude("leave repository", repository, token));

const approvalEngineService = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "MODULE_BOUND_LEAVE_ACTION_MESSAGE",
  "assertGenericActionAllowed",
  "canUseModuleBoundCreateForOthers",
  "leave.requests.create_for_employee",
  "moduleOperationType === \"LEAVE_REQUEST\"",
  "request.operation_type === \"LEAVE_REQUEST\"",
].forEach((token) => mustInclude("approval workflow engine leave mutation guard", approvalEngineService, token));

const frontendTypes = read("frontend/src/features/leave/leave.types.ts");
const frontendDetail = read("frontend/src/features/leave/LeaveRequestDetailDrawer.tsx");
const frontendTimeline = read("frontend/src/features/leave/LeaveApprovalTimelineDialog.tsx");
const frontendApprovalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
const frontendLeaveRequestForm = read("frontend/src/features/leave/LeaveRequestForm.tsx");
[
  "approval_current_step",
  "department_approved_at",
  "hr_approved_at",
  "engine_approval_request",
].forEach((token) => mustInclude("leave frontend types", frontendTypes, token));
mustInclude("leave detail drawer", frontendDetail, "Current step");
mustInclude("leave timeline", frontendTimeline, "Approval engine");
mustInclude("leave timeline", frontendTimeline, "Current step");
mustInclude("approvals page leave-specific action path", frontendApprovalsPage, "leaveApi.approveRequest");
mustInclude("approvals page leave-specific action path", frontendApprovalsPage, "operation_type === \"LEAVE_REQUEST\"");
mustInclude("leave request form create-for-others gating", frontendLeaveRequestForm, "canCreateForOthers");
mustInclude("leave request form linked profile guidance", frontendLeaveRequestForm, "Your employee profile is not linked to this login.");

const tests = read("tests/leave-approval-integration.test.ts");
[
  "You can only create leave requests for your own employee profile",
  "without broad approval create-for-others permission",
  "allowModuleBoundCreateForOthers",
  "blocks generic approval engine mutations for LEAVE_REQUEST",
  "already_submitted",
  "submitLeaveEngineApproval",
  "approvalEngineService.approveStep",
  "approvalEngineService.rejectStep",
  "approvalEngineService.cancelRequest",
  "approval_current_step",
  "request_reserved",
  "leave_used",
].forEach((token) => mustInclude("leave approval integration tests", tests, token));

if (failures.length > 0) {
  console.error("Leave approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Leave approval engine verifier passed.");
