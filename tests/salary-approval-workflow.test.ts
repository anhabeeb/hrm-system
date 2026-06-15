import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("salary and promotion approval workflow", () => {
  it("submits salary changes to the existing approvals workflow when required", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const controller = read("src/modules/employees/employees.controller.ts");

    expect(service).toContain("createSalaryApprovalIfRequired");
    expect(service).toContain('workflowKey: "salary_increment"');
    expect(service).toContain('approval_action: "salary_change"');
    expect(controller).toContain("Salary change submitted for approval.");
  });

  it("keeps pending salary approvals out of live salary history mutation", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const approvalBranch = service.slice(
      service.indexOf("export const addSalaryHistory"),
      service.indexOf("export const listDocuments"),
    );

    expect(approvalBranch).toContain("createSalaryApprovalIfRequired");
    expect(approvalBranch).toContain("if (approval?.approval_required) return approval;");
    expect(approvalBranch.indexOf("if (approval?.approval_required) return approval;")).toBeLessThan(
      approvalBranch.indexOf("applySalaryHistoryChange"),
    );
  });

  it("submits promotions with salary changes as one approval request before mutation", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const changeJob = service.slice(
      service.indexOf("export const changeJob"),
      service.indexOf("export const listJobHistory"),
    );

    expect(changeJob).toContain("createJobSalaryApprovalIfRequired");
    expect(changeJob).toContain("if (approval?.approval_required) return approval;");
    expect(changeJob).toContain("applyJobChangeNow");
    expect(service).toContain('approval_action: "job_change_with_salary"');
    expect(service).toContain('approval_type: "promotion_with_salary_change"');
  });

  it("approval finalization applies salary and promotion changes through target integration", () => {
    const integration = read("src/modules/approvals/approval-integration.service.ts");
    const approvalService = read("src/modules/approvals/approvals.service.ts");
    const approvalRepository = read("src/modules/approvals/approvals.repository.ts");

    expect(integration).toContain("applyApprovedSalaryApproval");
    expect(integration).toContain("applyApprovedJobSalaryApproval");
    expect(integration).toContain("Approved salary change was applied.");
    expect(integration).toContain("Approved promotion and salary change were applied.");
    const finalApprove = approvalService.slice(
      approvalService.indexOf("const finalApproveRequest"),
      approvalService.indexOf("export const listApprovalRequests"),
    );
    expect(finalApprove).toContain("claimRequestForApplication");
    expect(finalApprove.indexOf("claimRequestForApplication")).toBeLessThan(
      finalApprove.indexOf("applyApprovedTargetChange"),
    );
    expect(approvalRepository).toContain("status = 'applying'");
    expect(approvalRepository).toContain("status = 'applied'");
    expect(approvalRepository).toContain("finalizeAppliedRequest");
  });

  it("approved salary and promotion requests use approval_request_id for idempotency", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");
    const migration = read("migrations/0020_job_history_approval_request_id.sql");

    expect(repository).toContain("findSalaryHistoryByApprovalRequestId");
    expect(repository).toContain("findJobHistoryByApprovalRequestId");
    expect(repository).toContain("approval_request_id");
    expect(service).toContain("already_applied");
    expect(service).toContain("findAppliedSalaryApproval");
    expect(service).toContain("findAppliedJobSalaryApproval");
    expect(migration).toContain("ADD COLUMN approval_request_id");
  });

  it("failed approval application is marked safely and retry can recover already-applied targets", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const integration = read("src/modules/approvals/approval-integration.service.ts");
    const repository = read("src/modules/approvals/approvals.repository.ts");
    const routes = read("src/routes/approvals.routes.ts");

    expect(service).toContain("markRequestFailed");
    expect(service).toContain("approval_request_apply_failed");
    expect(service).toContain("retryApprovalRequest");
    expect(service).toContain("approval_retry_requested");
    expect(service).toContain("approval_retry_applied");
    expect(service).toContain("APPROVAL_ALREADY_PROCESSING");
    expect(service).toContain("findAppliedTargetChange");
    expect(integration).toContain("findAppliedTargetChange");
    expect(repository).toContain("recordRetryAttempt");
    expect(repository).toContain("retry_count = COALESCE(retry_count, 0) + 1");
    expect(routes).toContain("/:id/retry");
  });

  it("recently applying requests cannot be retried or marked failed before the recovery window", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const repository = read("src/modules/approvals/approvals.repository.ts");
    const retryBlock = service.slice(
      service.indexOf("export const retryApprovalRequest"),
      service.indexOf("const findMatchingThreshold"),
    );

    expect(service).toContain("approval_applying_recovery_minutes");
    expect(service).toContain("isApplyingRecoveryReady");
    expect(service).toContain("This approval request is currently applying. Please wait before retrying.");
    expect(retryBlock.indexOf("isApplyingRecoveryReady")).toBeLessThan(retryBlock.indexOf("recordRetryAttempt"));
    expect(retryBlock.indexOf("APPROVAL_ALREADY_PROCESSING")).toBeLessThan(retryBlock.indexOf("recordRetryAttempt"));
    expect(repository).toContain("markStaleApplyingRequestFailed");
    expect(repository).toContain("AND applying_started_at <= ?");
    expect(repository).toContain("applying_started_at = ?");
  });

  it("stale applying retry can recover existing targets or conditionally retry missing targets", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const repository = read("src/modules/approvals/approvals.repository.ts");
    const retryBlock = service.slice(
      service.indexOf("export const retryApprovalRequest"),
      service.indexOf("const findMatchingThreshold"),
    );

    expect(retryBlock).toContain("findAppliedTargetChange");
    expect(retryBlock).toContain("finalizeAppliedOrRecover");
    expect(retryBlock).toContain("markStaleApplyingRequestFailed");
    expect(retryBlock).toContain("Number(result.meta?.changes ?? 0) !== 1");
    expect(retryBlock).toContain('status: "failed"');
    expect(retryBlock).toContain("finalApproveRequest");
    expect(repository).toContain("WHERE company_id = ?");
    expect(repository).toContain("AND id = ?");
    expect(repository).toContain("AND status = 'applying'");
  });

  it("failed and applying approval requests expose retry safely without normal approval actions", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const frontendTable = read("frontend/src/features/approvals/ApprovalInboxTable.tsx");
    const statusBadge = read("frontend/src/components/data/StatusBadge.tsx");

    expect(service).toContain('!["applying", "failed"].includes(request.status)');
    expect(service).toContain('request.status === "failed"');
    expect(service).toContain('request.status === "applying" && applyingRetryReady');
    expect(service).toContain("disabled_reason: disabledReason");
    expect(frontendTable).toContain("boolish(row.can_approve)");
    expect(frontendTable).toContain("boolish(row.can_retry)");
    expect(statusBadge).toContain("Applying change...");
  });

  it("salary approval workflow defaults and typed settings are available", () => {
    const migration = read("migrations/0021_salary_approval_defaults.sql");
    const settings = read("src/services/settings.service.ts");
    const approvals = read("src/modules/approvals/approvals.service.ts");
    const frontendSettings = read("frontend/src/features/settings/structured-settings.ts");

    expect(migration).toContain("salary_increment");
    expect(migration).toContain("Salary & Promotion Changes");
    expect(migration).toContain("approvals.salary_rules");
    expect(settings).toContain("getSalaryApprovalSettings");
    expect(approvals).toContain("ensureDefaultSalaryApprovalWorkflow");
    expect(approvals).toContain("auto_apply_when_no_eligible_approver");
    expect(approvals).toContain("require_reason_for_approval");
    expect(approvals).toContain("require_reason_for_rejection");
    expect(frontendSettings).toContain("Salary and Promotion Approval");
    expect(frontendSettings).toContain("salary_change_approval_enabled");
  });

  it("self approval, reason policies, cancellation, and expiry are enforced through approval settings", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const routes = read("src/routes/approvals.routes.ts");
    const api = read("frontend/src/features/approvals/approvals.api.ts");
    const types = read("frontend/src/features/approvals/approvals.types.ts");
    const page = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    const dialog = read("frontend/src/features/approvals/ApprovalActionDialog.tsx");

    expect(service).toContain("assertSelfApprovalAllowed");
    expect(service).toContain("assertReasonPolicy");
    expect(service).toContain("APPROVAL_REASON_REQUIRED");
    expect(service).toContain("REJECTION_REASON_REQUIRED");
    expect(service).toContain("expireRequestIfOpen");
    expect(service).toContain("allow_requester_self_approval");
    expect(service).toContain("cancelApprovalRequest");
    expect(service).toContain("APPROVAL_REQUEST_EXPIRED");
    expect(routes).toContain('approvalsRoutes.post("/:id/approve", requirePermission("approvals.approve"), controller.approveApproval)');
    expect(routes).toContain('approvalsRoutes.post("/:id/reject", requirePermission("approvals.reject"), controller.rejectApproval)');
    expect(routes).toContain("/:id/cancel");
    expect(api).toContain("/retry");
    expect(api).toContain("/cancel");
    expect(types).toContain("can_retry");
    expect(types).toContain("disabled_reason");
    expect(page).toContain("salary_approval_settings");
    expect(page).toContain("require_reason_for_approval");
    expect(page).toContain("require_reason_for_rejection");
    expect(dialog).toContain("reasonRequired");
    expect(dialog).not.toContain("A reason is required for approval actions.");
  });

  it("auto-apply fallback is enforced only after checking eligible approvers", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const repository = read("src/modules/approvals/approvals.repository.ts");
    const employees = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("resolveEligibleApproverRequirement");
    expect(service).toContain("countEligibleApprovers");
    expect(service).toContain("NO_ELIGIBLE_APPROVER");
    expect(service).not.toContain('action: "APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER"');
    expect(employees).toContain("APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER");
    expect(employees).toContain("APPROVAL_AUTO_APPLY_FAILED");
    expect(employees).toContain("auditAutoApplyNoEligibleApprover");
    expect(repository).toContain("countEligibleApprovers");
    expect(repository).toContain("u.id <> ?");
  });

  it("auto-apply audit is written after target success and not before direct application", () => {
    const employees = read("src/modules/employees/employees.service.ts");
    const salaryBlock = employees.slice(
      employees.indexOf("export const addSalaryHistory"),
      employees.indexOf("const parseApprovalPayload"),
    );
    const jobBlock = employees.slice(
      employees.indexOf("export const changeJob"),
      employees.indexOf("export const listJobHistory"),
    );

    expect(salaryBlock.indexOf("applySalaryHistoryChange")).toBeLessThan(salaryBlock.indexOf("APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER"));
    expect(jobBlock.indexOf("applyJobChangeNow")).toBeLessThan(jobBlock.indexOf("APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER"));
    expect(salaryBlock).toContain("APPROVAL_AUTO_APPLY_FAILED");
    expect(jobBlock).toContain("APPROVAL_AUTO_APPLY_FAILED");
  });

  it("approval finalization and terminal transitions are conditional and row-count checked", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const repository = read("src/modules/approvals/approvals.repository.ts");
    const migration = read("migrations/0022_approval_finalization_hardening.sql");

    expect(service).toContain("batchChanges(results, 0) === 1");
    expect(service).toContain("transitionOrThrow");
    expect(service).toContain("statusTransitionError");
    expect(service).toContain('allowedStatuses: ["pending", "in_progress"]');
    expect(service).toContain("actionComment(input, `Override ${input.decision}`)");
    expect(repository).toContain("transitionRequestWithAction");
    expect(repository).toContain("expireRequestIfOpen");
    expect(repository).toContain("AND status IN ('pending', 'in_progress')");
    expect(repository).toContain("WHERE company_id = ? AND id = ? AND status IN");
    expect(repository).toContain("INSERT OR IGNORE INTO approval_actions");
    expect(migration).toContain("WHERE action = 'applied'");
    expect(migration).toContain("applied_at");
    expect(migration).toContain("failure_code");
    expect(migration).toContain("retry_count");
    expect(migration).toContain("idx_approval_actions_unique_final_apply");
  });

  it("approval action audits are written only after conditional transitions succeed", () => {
    const service = read("src/modules/approvals/approvals.service.ts");
    const actOnApproval = service.slice(
      service.indexOf("const actOnApproval"),
      service.indexOf("export const approveApprovalRequest"),
    );
    const cancel = service.slice(
      service.indexOf("export const cancelApprovalRequest"),
      service.indexOf("export const retryApprovalRequest"),
    );
    const override = service.slice(
      service.indexOf("export const overrideApprovalRequest"),
      service.indexOf("export const createApprovalRequestForWorkflow"),
    );

    expect(actOnApproval.indexOf("transitionOrThrow")).toBeLessThan(actOnApproval.indexOf("auditBestEffort"));
    expect(cancel.indexOf("transitionOrThrow")).toBeLessThan(cancel.indexOf("auditBestEffort"));
    expect(override.indexOf("transitionOrThrow")).toBeLessThan(override.indexOf("auditBestEffort"));
    expect(actOnApproval).not.toContain("auditOrFail(env, context");
    expect(cancel).not.toContain("auditOrFail(env, context");
  });

  it("approval schema hardening is guarded before deployment", () => {
    const script = read("scripts/verify-approval-schema.mjs");
    const packageJson = read("package.json");
    const buildRunner = read("scripts/run-production-build-checks.mjs");
    const checklist = read("docs/deployment-checklist.md");

    expect(script).toContain("Approval schema verification passed.");
    expect(script).toContain("applied_at");
    expect(script).toContain("applying_started_at");
    expect(script).toContain("idx_approval_actions_unique_final_apply");
    expect(packageJson).toContain("verify:approval-schema");
    expect(buildRunner).toContain('"verify:approval-schema"');
    expect(checklist).toContain("PRAGMA table_info(approval_requests)");
    expect(checklist).toContain("do not blindly rerun");
  });

  it("approved salary requests revalidate current salary timeline before applying", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("expectedCurrentSalaryId");
    expect(service).toContain("SALARY_TIMELINE_CHANGED");
    expect(service).toContain("SALARY_CHANGE_FINALIZED_PERIOD_LOCKED");
    expect(service).toContain("SALARY_OVERLAP");
  });

  it("approved promotion requests revalidate current job state before applying", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("expectedJob");
    expect(service).toContain("JOB_STATE_CHANGED");
    expect(service).toContain("skipPermissionCheck: true");
  });

  it("frontend shows pending salary and promotion approvals without replacing applied history", () => {
    const salaryPanel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");
    const jobPanel = read("frontend/src/features/employees/EmployeeJobHistoryPanel.tsx");

    expect(salaryPanel).toContain("Pending Salary Changes");
    expect(salaryPanel).toContain("cancelApproval");
    expect(salaryPanel).toContain("No pending salary changes.");
    expect(salaryPanel).toContain("current salary will remain unchanged until approval");
    expect(jobPanel).toContain("cancelApproval");
    expect(jobPanel).toContain("No pending job or promotion changes.");
    expect(jobPanel).toContain("employee job and salary details will remain unchanged until the request is approved");
  });

  it("approval detail drawer presents salary and promotion business values before raw payload", () => {
    const drawer = read("frontend/src/features/approvals/ApprovalDetailDrawer.tsx");

    expect(drawer).toContain("Current salary");
    expect(drawer).toContain("Proposed salary");
    expect(drawer).toContain("Salary difference");
    expect(drawer).toContain("Current outlet");
    expect(drawer).toContain("Proposed outlet");
    expect(drawer).toContain("Safe Technical Payload");
  });
});
