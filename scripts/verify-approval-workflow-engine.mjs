import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

const listFiles = (dir) =>
  readdirSync(resolve(root, dir)).flatMap((entry) => {
    const full = resolve(root, dir, entry);
    if (statSync(full).isDirectory()) return listFiles(relative(root, full));
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

mustExist("migrations/0061_general_approval_workflow_engine.sql");
mustExist("src/modules/approvals/approval-workflow-engine.service.ts");
mustExist("src/modules/approvals/approval-approver-resolver.service.ts");
mustExist("src/modules/approvals/approval-workflow-engine.repository.ts");
mustExist("src/modules/approvals/approval-workflow-engine.controller.ts");
mustExist("frontend/src/features/approvals/ApprovalEngineRequestsTable.tsx");
mustExist("tests/approval-workflow-engine.test.ts");

const migration = read("migrations/0061_general_approval_workflow_engine.sql");
[
  "ALTER TABLE approval_workflows ADD COLUMN code",
  "ALTER TABLE approval_workflows ADD COLUMN operation_type",
  "ALTER TABLE approval_steps ADD COLUMN approver_resolver_type",
  "CREATE TABLE IF NOT EXISTS approval_request_steps",
  "CREATE TABLE IF NOT EXISTS approval_request_participants",
  "idx_approval_workflows_company_operation",
  "idx_approval_request_steps_company_user",
  "idx_approval_actions_company_actor_user",
].forEach((token) => mustInclude("approval engine migration", migration, token));

const routes = read("src/routes/approvals.routes.ts");
[
  'approvalsRoutes.get("/workflows"',
  'approvalsRoutes.post("/workflows"',
  'approvalsRoutes.post("/workflows/:workflowId/activate"',
  'approvalsRoutes.post("/workflows/:workflowId/deactivate"',
  'approvalsRoutes.post("/workflows/:workflowId/archive"',
  'approvalsRoutes.get("/workflows/:workflowId/steps"',
  'approvalsRoutes.post("/workflows/:workflowId/steps"',
  'approvalsRoutes.post("/workflows/:workflowId/steps/:stepId/disable"',
  'approvalsRoutes.post("/requests"',
  'approvalsRoutes.post("/requests/:id/submit"',
  "approvals.requests.createForOthers",
  "approvals.requests.cancelAny",
  'approvalsRoutes.post("/requests/:id/approve"',
  'approvalsRoutes.post("/requests/:id/reject"',
  'approvalsRoutes.get("/requests/:id/timeline"',
  "approvals.department.view",
  "approvals.hrFinal.approve",
  "approvals.financeFinal.reject",
  'approvalsRoutes.get("/my-pending"',
  'approvalsRoutes.get("/my-requests"',
].forEach((token) => mustInclude("approval routes", routes, token));

const permissions = read("seeds/permissions.seed.sql");
[
  "approvals.workflows.view",
  "approvals.workflows.manage",
  "approvals.workflowSteps.manage",
  "approvals.requests.view",
  "approvals.requests.createForOthers",
  "approvals.requests.cancelAny",
  "approvals.requests.approve",
  "approvals.requests.reject",
  "approvals.department.approve",
  "approvals.hrFinal.approve",
  "approvals.financeFinal.approve",
].forEach((token) => mustInclude("permission seed", permissions, token));

const resolver = read("src/modules/approvals/approval-approver-resolver.service.ts");
[
  "DEPARTMENT_HEAD",
  "DEPARTMENT_LEVEL",
  "HR_FINAL_APPROVER",
  "FINANCE_FINAL_APPROVER",
  "ROLE_PERMISSION",
  "SUPER_ADMIN",
  "allowSelfApproval",
  "SKIP_TO_HR",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCK_SUBMISSION",
].forEach((token) => mustInclude("approver resolver", resolver, token));

const service = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "createWorkflow",
  "createWorkflowStep",
  "findWorkflowForOperation",
  "createApprovalRequestDraft",
  "approvals.requests.createForOthers",
  "You cannot create approval requests for another employee",
  "canSubmitApprovalRequest",
  "canCancelApprovalRequest",
  "buildApprovalRequestVisibilityFilter",
  "canViewApprovalRequest",
  "canActOnApprovalStep",
  "assignedApproverUserMapsToRequesterEmployee",
  "Department visibility policy",
  "assertSafePayload",
  "sensitivePayloadKeys",
  "submitApprovalRequest",
  "createRequestStep",
  "approveStep",
  "rejectStep",
  "cancelRequest",
  "assignApprover",
  "findAssignableApprover",
  "findEmployeeForApproval",
  "getMyPending",
  "seedDefaultWorkflowTemplate",
  "approval_request_submitted",
].forEach((token) => mustInclude("approval engine service", service, token));

const frontendPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
[
  "Approval Requests",
  "My Pending",
  "My Requests",
  "ApprovalEngineRequestsTable",
  "ApprovalEngineActionDialog",
  "approveEngineRequest",
  "rejectEngineRequest",
].forEach((token) => mustInclude("approval frontend", frontendPage, token));

const frontendApi = read("frontend/src/features/approvals/approvals.api.ts");
[
  "/approvals/requests",
  "/approvals/my-pending",
  "/approvals/my-requests",
  "engineTimeline",
].forEach((token) => mustInclude("approval frontend api", frontendApi, token));

const tests = read("tests/approval-workflow-engine.test.ts");
[
  "creates workflow",
  "createWorkflowStep",
  "resolveApproversForStep",
  "SKIP_TO_HR",
  "submitApprovalRequest",
  "approveStep",
  "rejectStep",
  "cannot approve your own request",
  "admin-created on-behalf requests",
  "approvals.department.view",
  "scopes approval timelines",
  "approvals.department.approve",
  "builds row-level visibility filters",
  "Sensitive field",
  "blocks subject spoofing",
  "Super Admin on behalf request",
  "enforces submit ownership",
  "enforces cancel ownership",
  "approvals.requests.cancelAny",
  "findAssignableApprover",
  "Self approval exception",
].forEach((token) => mustInclude("approval workflow tests", tests, token));

for (const file of listFiles("frontend/src")) {
  const text = readFileSync(file, "utf8");
  if (/window\.alert\s*\(|\balert\s*\(|window\.confirm\s*\(|\bconfirm\s*\(/.test(text)) {
    failures.push(`Browser alert/confirm usage found in ${relative(root, file).replace(/\\/g, "/")}`);
  }
}

if (!/sensitivePayloadKeys[\s\S]*password_hash[\s\S]*session_token[\s\S]*reset_token[\s\S]*totp_secret/.test(service)) {
  failures.push("Approval engine service must reject sensitive payload keys.");
}
if (!/createApprovalRequestDraft[\s\S]*requesterEmployee[\s\S]*findEmployeeForApproval[\s\S]*department_id[\s\S]*position_id[\s\S]*level/.test(service)) {
  failures.push("Approval request creation must derive requester/subject structure safely.");
}
if (!/createApprovalRequestDraft[\s\S]*approvals\.requests\.createForOthers[\s\S]*subject_employee_id[\s\S]*another employee/.test(service)) {
  failures.push("Approval request creation must block normal users from spoofing subject employees.");
}
if (!/canSubmitApprovalRequest[\s\S]*approvals\.requests\.createForOthers/.test(service) ||
    !/canSubmitApprovalRequest[\s\S]*requester_user_id === context\.actorUserId/.test(service) ||
    !/canSubmitApprovalRequest[\s\S]*actorOwnsRequesterEmployee/.test(service) ||
    !/submitApprovalRequest[\s\S]*canSubmitApprovalRequest/.test(service)) {
  failures.push("Approval request submit must enforce requester ownership or explicit create-for-others access.");
}
if (!/canCancelApprovalRequest[\s\S]*approvals\.requests\.cancelAny[\s\S]*cancellation reason is required/.test(service) ||
    !/cancelRequest[\s\S]*canCancelApprovalRequest/.test(service)) {
  failures.push("Approval request cancel must enforce owner/global permission checks with reason for cross-employee cancellation.");
}
if (!/assignApprover[\s\S]*findAssignableApprover[\s\S]*requiredPermission[\s\S]*requiredRoleId[\s\S]*allowSelfApproval/.test(service)) {
  failures.push("Approver assignment must validate same-company eligible assignees.");
}
if (/assignApprover[\s\S]*requester_user_id === userId && !permissionService\.isSuperAdmin/.test(service) ||
    /assignApprover[\s\S]*candidate\.user_id === request\.requester_user_id[\s\S]*!permissionService\.isSuperAdmin/.test(service)) {
  failures.push("Approver assignment must not let Super Admin assign the requester unless self-approval is enabled.");
}

if (failures.length > 0) {
  console.error("Approval workflow engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Approval workflow engine verifier passed.");
