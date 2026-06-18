import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const mustExist = (file) => {
  if (!exists(file)) failures.push(`${file} is missing.`);
};

const mustInclude = (label, source, markers) => {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${label} is missing marker: ${marker}`);
  }
};

[
  "src/routes/self-service.routes.ts",
  "src/modules/self-service/self-service.controller.ts",
  "src/modules/self-service/self-service.service.ts",
  "src/modules/self-service/self-service.repository.ts",
  "src/modules/self-service/self-service.types.ts",
  "frontend/src/features/self-service/self-service.api.ts",
  "frontend/src/features/self-service/self-service.types.ts",
  "frontend/src/features/self-service/MyRequestsPage.tsx",
  "frontend/src/features/self-service/SelfServiceShared.tsx",
  "frontend/src/features/self-service/SelfServiceApprovalChainDialog.tsx",
  "tests/self-service-approval-chain.test.ts",
].forEach(mustExist);

const routes = read("src/routes/self-service.routes.ts");
mustInclude("self-service routes", routes, [
  'selfServiceRoutes.get("/requests/:requestId/approval-chain"',
  'requireFeature("leave_management")',
  'requirePermission("self.requests.view")',
  "controller.approvalChain",
]);

const controller = read("src/modules/self-service/self-service.controller.ts");
mustInclude("self-service controller", controller, ["approvalChain", "getSelfApprovalChain", 'c.req.param("requestId")']);

const repository = read("src/modules/self-service/self-service.repository.ts");
mustInclude("self-service repository", repository, [
  "findSelfApprovalRequest",
  "listSelfApprovalRequestSteps",
  "listSelfApprovalActions",
  "findSelfLeaveRequestForApproval",
  "approval_request_steps",
  "approval_actions",
  "requester_user_id = ?",
  "requester_employee_id = ?",
  "subject_employee_id = ?",
  "employee_id = ?",
  "policy_snapshot_json",
  "document_required",
]);

const service = read("src/modules/self-service/self-service.service.ts");
mustInclude("self-service service", service, [
  "getSelfApprovalChain",
  "SHOW_APPROVER_NAMES_TO_EMPLOYEES = false",
  "safeApproverName",
  "no_approval_required",
  "not_required",
  "Approval setup needs review by HR.",
  "FINANCE_FINAL_APPROVER",
  "policy_summary",
  "salary_deduction_required",
  "document_required_reason",
]);

if (/Finance[^;\n]+push|push\([^)]*Finance|step_label:\s*["']Finance/.test(service)) {
  failures.push("Self-service approval chain appears to synthesize a Finance step. Finance must come only from configured request steps.");
}

const frontendApi = read("frontend/src/features/self-service/self-service.api.ts");
mustInclude("self-service frontend API", frontendApi, ["approvalChain", "/approval-chain"]);

const table = read("frontend/src/features/self-service/SelfServiceShared.tsx");
mustInclude("self-service requests table", table, ["onViewApprovalChain", "View Progress", "RowActions"]);

const dialog = read("frontend/src/features/self-service/SelfServiceApprovalChainDialog.tsx");
mustInclude("approval chain dialog", dialog, [
  "Approval progress",
  "Approval chain",
  "Finance appears only when it is part of this request workflow.",
  "document_required",
  "payroll_impact_label",
  "StatusBadge",
]);

const myRequests = read("frontend/src/features/self-service/MyRequestsPage.tsx");
mustInclude("my requests page", myRequests, [
  "SelfServiceApprovalChainDialog",
  "approvalChain",
  "onViewApprovalChain",
]);

const settings = read("frontend/src/features/settings/ApprovalSettingsPanel.tsx");
mustInclude("approval settings note", settings, [
  "Finance approval is optional",
  "only used when included in the configured workflow",
]);

const tests = read("tests/self-service-approval-chain.test.ts");
[
  "own leave approval chain",
  "another employee",
  "HR-only workflow",
  "Finance does not appear when not configured",
  "Finance appears when configured",
  "Current pending step",
  "Approved previous step",
  "Rejected step",
  "No approval required",
  "Approver names are hidden",
  "Role and level labels",
  "document-required status",
  "payroll impact",
].forEach((marker) => {
  if (!tests.includes(marker)) failures.push(`self-service approval chain tests missing scenario marker: ${marker}`);
});

if (failures.length) {
  console.error("Self-service approval chain verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Self-service approval chain verification passed.");
