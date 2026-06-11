import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Leave approval verification failed: ${message}`);
  process.exit(1);
};

const migration = read("migrations/0038_leave_approval_workflow_hardening.sql");
const engineMigration = read("migrations/0062_leave_approval_engine_integration.sql");
const routes = read("src/routes/leave.routes.ts");
const approvalRoutes = read("src/routes/approvals.routes.ts");
const service = read("src/modules/leave/leave.service.ts");
const repository = read("src/modules/leave/leave.repository.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const api = read("frontend/src/features/leave/leave.api.ts");
const page = read("frontend/src/features/leave/LeavePage.tsx");
const inbox = read("frontend/src/features/leave/LeaveApprovalInboxTable.tsx");
const settings = read("frontend/src/features/leave/LeaveApprovalSettingsPanel.tsx");
const timeline = read("frontend/src/features/leave/LeaveApprovalTimelineDialog.tsx");
const tests = read("tests/leave-approvals.test.ts");
const integrationTests = read("tests/leave-approval-integration.test.ts");

for (const token of [
  "CREATE TABLE IF NOT EXISTS leave_approval_steps",
  "approval_status",
  "submitted_at",
  "approved_at",
  "rejected_at",
  "cancelled_at",
  "withdrawn_at",
  "idx_leave_approval_steps_company_request",
  "idx_leave_approval_steps_company_user_status",
  "idx_leave_balance_tx_company_leave_request",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

for (const token of [
  "approval_current_step",
  "approval_submitted_at",
  "approval_completed_at",
  "department_approved_at",
  "hr_approved_at",
  "idx_leave_requests_company_approval_request",
]) {
  if (!engineMigration.includes(token)) fail(`engine migration missing ${token}`);
}

for (const route of [
  '"/approvals/inbox"',
  '"/approvals/history"',
  '"/approvals/:requestId"',
  '"/requests/:requestId/timeline"',
  '"/requests/:id/submit"',
  '"/requests/:id/approve"',
  '"/requests/:id/reject"',
  '"/requests/:id/cancel"',
  '"/requests/:id/withdraw"',
  '"/requests/:id/delegate"',
  '"/requests/:id/escalate"',
]) {
  if (!routes.includes(route)) fail(`missing approval route ${route}`);
}

for (const permission of [
  "leave.requests.submit",
  "leave.requests.create_for_employee",
  "leave.requests.cancel",
  "leave.requests.withdraw",
  "leave.requests.override",
  "leave.approvals.view",
  "leave.approvals.approve",
  "leave.approvals.reject",
  "leave.approvals.delegate",
  "leave.approvals.escalate",
  "leave.approvals.override",
  "leave.approvals.settings.manage",
  "leave.timeline.view",
]) {
  if (!permissions.includes(permission)) fail(`permission ${permission} is not seeded`);
  if (!roles.includes(permission)) fail(`permission ${permission} is not assigned to default roles`);
  if (!routes.includes(permission) && !approvalRoutes.includes(permission) && !page.includes(permission)) fail(`permission ${permission} is not enforced or guarded`);
}

for (const token of [
  "submitLeaveEngineApproval",
  "createLeaveEngineApprovalDraft",
  "approvalEngineService.createApprovalRequestDraft",
  "approvalEngineService.submitApprovalRequest",
  "approvalEngineService.approveStep",
  "approvalEngineService.rejectStep",
  "approvalEngineService.cancelRequest",
  "buildLeaveApprovalWorkflowIfRequired",
  "assertApprovalStepActionable",
  "LEAVE_APPROVAL_INVALID_TRANSITION",
  "LEAVE_APPROVER_NOT_AUTHORIZED",
  "LEAVE_APPROVAL_STEP_NOT_PENDING",
  "createLeaveRequestWithBalanceTransaction",
  "updateLeaveApprovalStepAndRequestStatus",
  "planReleasePendingBalance",
  "updateLeaveRequestStatusWithBalanceTransaction",
  "approvalRequestSync",
  "actorHasRoleKey",
]) {
  if (!service.includes(token) && !repository.includes(token)) fail(`workflow/balance integration missing ${token}`);
}

for (const token of [
  "findEngineApprovalRequestForLeave",
  "listRequestsByIds",
  "prepareCreateApprovalRequest",
  "prepareCreateApprovalStep",
  "prepareUpdateGenericApprovalRequest",
  "findCurrentApprovalStep",
  "findGenericApprovalRequestByEntity",
  "listApprovalInbox",
  "listApprovalHistory",
  "listLeaveRequestTransactions",
]) {
  if (!repository.includes(token)) fail(`repository missing ${token}`);
}

const approveBody = service.slice(service.indexOf("export const approveRequest"), service.indexOf("export const rejectRequest"));
if (!approveBody.includes("approvalEngineService.approveStep")) fail("approve path does not route engine-linked leave approvals through the approval engine");
if (!approveBody.includes("leave_request:${request.id}:used")) fail("approve path does not use idempotent used balance transaction");
if (!approveBody.includes("updateLeaveApprovalStepAndRequestStatus")) fail("legacy approve path does not update approval step with request status");
if (approveBody.includes("await repository.updateRequest(env, context.companyId, id, { status: \"approved\" }")) fail("approve path has unsafe direct status update");

const submitBody = service.slice(service.indexOf("export const submitRequest"), service.indexOf("const pendingStatuses"));
for (const token of [
  "validateRequestBusinessRules",
  "submitLeaveEngineApproval",
  "approval_current_step",
  "planRequestBalanceForCreation",
  "findTransactionByIdempotencyKey",
]) {
  if (!submitBody.includes(token)) fail(`submit path missing ${token}`);
}
if (submitBody.includes("await repository.updateRequest(env, context.companyId, id, {\n    status: \"pending_approval\"")) {
  fail("submitRequest only updates status without approval workflow/balance reservation");
}

for (const token of ["request_released", "withdrawn_released", "cancel_used_reversal"]) {
  if (!service.includes(token)) fail(`release/reversal path missing ${token}`);
}

for (const token of [
  "listApprovalInbox",
  "listApprovalHistory",
  "getTimeline",
  "withdrawRequest",
  "delegateRequest",
  "escalateRequest",
]) {
  if (!api.includes(token)) fail(`frontend API missing ${token}`);
}

for (const token of [
  'TabsTrigger value="approvals"',
  'TabsTrigger value="approval-history"',
  'TabsTrigger value="approval-settings"',
  "LeaveApprovalInboxTable",
  "LeaveApprovalTimelineDialog",
  "LeaveApprovalSettingsPanel",
  "LeaveDelegateDialog",
]) {
  if (!page.includes(token)) fail(`frontend leave page missing ${token}`);
}

for (const token of ["Approve", "Reject", "Delegate"]) {
  if (!inbox.includes(token)) fail(`approval inbox missing ${token}`);
}
if (!timeline.includes("approval_steps") || !timeline.includes("balance_transactions")) fail("timeline does not show approval steps and balance transactions");
if (!timeline.includes("generic_approval_request")) fail("timeline does not include generic approval state");
if (!timeline.includes("engine_approval_request") || !timeline.includes("Approval engine")) fail("timeline does not include approval engine state");
if (!settings.includes("Balance-safe lifecycle")) fail("approval settings panel missing balance-safe workflow copy");
if (!settings.includes("approvalsApi.updateWorkflow") || !settings.includes("Save workflow settings") || settings.includes("disabled>Workflow editor")) {
  fail("approval settings panel is still read-only or disabled-only");
}
for (const token of [
  "Approval steps",
  "Add approval step",
  "Create approval step",
  "Update approval step",
  "approvalsApi.createStep",
  "approvalsApi.updateStep",
  "approvalsApi.deleteStep",
  "workflow is enabled but has no approval steps",
  "Multi-level mode has fewer than two steps",
  "Duplicate step order",
  "has no role and no permission requirement",
]) {
  if (!settings.includes(token)) fail(`approval settings panel missing multi-step editor support: ${token}`);
}
if (settings.includes("First approval role")) fail("approval settings panel still edits only the first approval step");
if (!approvalRoutes.includes("leave.approvals.settings.manage")) fail("approval settings permission is not accepted by approval workflow routes");

if (`${tests}\n${integrationTests}`.includes("it.todo")) fail("Phase 9B-critical tests still contain it.todo placeholders");
for (const token of [
  "submit creates reusable approval engine records while preserving balance batches",
  "creates and submits an engine approval request while reserving pending balance",
  "final approval goes through approvalEngineService.approveStep and applies leave_used balance deduction",
  "rejects and cancels pending engine-linked leave requests through the engine and releases pending balance",
  "batches request creation, generic approval, approval steps, ledger insert, and balance update",
  "draft submit batches request status, generic approval, approval steps, ledger insert, and balance update",
  "batches approval step decision, request status update, generic approval sync, ledger insert, and balance update",
  "syncs generic approval requests on reject, cancel, and withdraw status batches",
  "submit with approvals disabled auto-approves and moves balance to used",
  "first-level approval marks the step approved and advances the generic approval request",
  "final approval moves pending balance to used and marks generic approval request approved",
  "rejection releases pending balance and marks generic approval request rejected",
  "cancellation of approved leave reverses used balance and closes generic approval request",
  "assigned user can approve assigned step and assigned-user restriction blocks other users",
  "delegated user can approve delegated step and non-delegated user cannot",
  "user with permission but wrong approver_role_key cannot approve role-specific step",
  "outlet manager cannot approve outside outlet scope but can approve inside outlet scope",
  "inactive user cannot approve",
  "Super Admin override requires reason before acting",
  "invalid approval transitions and self approval are blocked",
]) {
  if (!`${tests}\n${integrationTests}`.includes(token)) fail(`missing Phase 9B test: ${token}`);
}
if (!tests.includes("assertApprovalStepActionable")) fail("leave approval tests do not exercise the real approver authorization helper");
if (((tests.match(/read\("src\/modules\/leave\/leave.service.ts"\)/g) ?? []).length > 6) && !integrationTests.includes("approvalEngineService.approveStep")) {
  fail("leave approval tests still lean too heavily on source string checks");
}

console.log("Leave approval schema verification passed.");
