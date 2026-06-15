import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const mustInclude = (label, content, needle) => {
  if (!content.includes(needle)) fail.push(`${label}: missing ${needle}`);
};

const migration = `${read("migrations/0073_employee_lifecycle_approval_engine.sql")}\n${read("migrations/0074_employee_lifecycle_safety_hardening.sql")}`;
const routes = read("src/routes/employees.routes.ts");
const service = read("src/modules/employee-lifecycle/employee-exit.service.ts");
const repository = read("src/modules/employee-lifecycle/employee-exit.repository.ts");
const validators = read("src/modules/employee-lifecycle/employee-exit.validators.ts");
const types = read("src/modules/employee-lifecycle/employee-exit.types.ts");
const controller = read("src/modules/employee-lifecycle/employee-exit.controller.ts");
const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
const approvalTypes = read("src/modules/approvals/approval-workflow-engine.types.ts");
const page = read("frontend/src/features/offboarding/OffboardingPage.tsx");
const dialog = read("frontend/src/features/offboarding/EmployeeExitRequestDialog.tsx");
const drawer = read("frontend/src/features/offboarding/EmployeeExitDetailDrawer.tsx");
const api = read("frontend/src/features/offboarding/employeeExit.api.ts");
const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const router = read("frontend/src/app/router.tsx");
const permissions = read("seeds/permissions.seed.sql");
const tests = read("tests/employee-lifecycle-approval-integration.test.ts");

[
  "employee_exit_requests",
  "employee_offboarding_tasks",
  "employee_exit_status_history",
  "RESIGNATION",
  "OFFBOARDING",
  "approval_request_id",
  "final_settlement_status",
  "access_disable_status",
  "offboarding_checklist_status",
  "idx_employee_exit_pending_guard",
  "employeeLifecycle.resignations.createForOthers",
  "employeeLifecycle.resignations.viewOwn",
  "employeeLifecycle.offboarding.viewOwn",
  "employeeLifecycle.exitRequests.viewAll",
  "employeeLifecycle.offboarding.tasks.view",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employeeLifecycle.offboarding.complete",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
].forEach((needle) => mustInclude("migration", migration, needle));

[
  "/exit-requests",
  "/exit-requests/:requestId/submit",
  "/exit-requests/:requestId/approve",
  "/exit-requests/:requestId/reject",
  "/exit-requests/:requestId/cancel",
  "/exit-requests/:requestId/apply",
  "/exit-requests/:requestId/complete",
  "/exit-requests/:requestId/timeline",
  "/exit-requests/:requestId/tasks",
  "/exit-requests/:requestId/audit",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
  "approvals.operationExecutor.apply",
  "employeeLifecycle.resignations.viewOwn",
  "employeeLifecycle.offboarding.viewOwn",
  "employeeLifecycle.exitRequests.viewAll",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employeeLifecycle.offboarding.tasks.view",
].forEach((needle) => mustInclude("routes", routes, needle));

[
  "createEmployeeExitRequest",
  "submitEmployeeExitForApproval",
  "approveEmployeeExitStep",
  "rejectEmployeeExitStep",
  "cancelEmployeeExitRequest",
  "applyApprovedEmployeeExitRequest",
  "completeEmployeeExitOffboarding",
  "buildEmployeeExitVisibilityFilter",
  "canViewEmployeeExitRequest",
  "canViewAllLifecycleRequests",
  "employeeLifecycle.resignations.viewOwn",
  "employeeLifecycle.exitRequests.viewAll",
  "canCreateForEmployee",
  "Department managers can create lifecycle requests only for lower-level employees",
  "resolveOperationResponsibility",
  "assertEmployeeExitExecutionAllowed",
  "employeeLifecycle.resignations.apply",
  "employeeLifecycle.offboarding.apply",
  "approvals.operationExecutor.apply",
  "already_submitted",
  "ensureTasksGenerated",
  "taskSpecs",
  "resolveTaskOwnership",
  "PAYROLL_FUNCTION",
  "FINANCE_FUNCTION",
  "DEVICE_MANAGEMENT_FUNCTION",
  "KIOSK_FUNCTION",
  "DOCUMENT_KYC_FUNCTION",
  "SUBJECT_DEPARTMENT",
  "PENDING_MANUAL_ASSIGNMENT",
  "canActOnOffboardingTask",
  "canViewOffboardingTask",
  "canViewOffboardingTasks",
  "buildOffboardingTaskVisibilityFilter",
  "assertCanCompleteOffboardingTask",
  "assertCanWaiveOffboardingTask",
  "employeeLifecycle.offboarding.tasks.view",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employee_offboarding_tasks_generated",
  "employee_offboarding_started",
  "employee_offboarding_completed",
  "countActiveSuperAdmins",
  "You cannot offboard the last active Super Admin.",
  "You cannot disable the last active Super Admin login.",
  "Required offboarding tasks must be completed or waived before completion.",
  "APPROVED_PENDING_LAST_WORKING_DATE",
  "waiting_for_last_working_date",
  "employee_resignation_applied_after_notice",
  "MISSING_LAST_WORKING_DATE",
  "employee_resignation_notice_period_started",
  "Employee login remains active during notice period",
  "moduleCancelPermission: permissions.cancel",
].forEach((needle) => mustInclude("service", service, needle));

[
  "findDuplicateActiveRequest",
  "createDefaultTasks",
  "countOpenRequiredTasks",
  "applyEmployeeExitStatus",
  "UPDATE employees",
  "UPDATE users SET status = 'disabled'",
  "UPDATE sessions SET revoked_at",
  "employee_exit_status_history",
  "INSERT OR IGNORE INTO employee_offboarding_tasks",
  "assigned_user_id",
  "metadata_json",
  "countActiveSuperAdmins",
  "employeeHasActiveSuperAdminUser",
].forEach((needle) => mustInclude("repository", repository, needle));

[
  "EMPLOYEE_RESIGNATION",
  "RESIGNATION_ON_BEHALF",
  "IMMEDIATE_RESIGNATION",
  "STANDARD_OFFBOARDING",
  "ACCESS_DISABLE_REQUEST",
  "PENDING_CLEARANCE",
  "OFFBOARDING_IN_PROGRESS",
  "APPROVED_PENDING_LAST_WORKING_DATE",
  "FAILED_TO_APPLY",
  "LOGIN_DISABLE_REVIEW",
].forEach((needle) => mustInclude("types", types, needle));

[
  "assertSafeLifecyclePayload",
  "api_key",
  "device_secret",
  "Last working date cannot be before resignation date",
  "A reason is required",
].forEach((needle) => mustInclude("validators", validators, needle));

[
  "listEmployeeExitRequests",
  "employeeExitTasks",
  "employeeExitAudit",
].forEach((needle) => mustInclude("controller", controller, needle));

[
  "OFFBOARDING",
].forEach((needle) => mustInclude("approval types", approvalTypes, needle));

[
  "MODULE_BOUND_EMPLOYEE_LIFECYCLE_ACTION_MESSAGE",
  "employeeLifecycle.resignations.createForOthers",
  "employeeLifecycle.offboarding.createForOthers",
  "employeeLifecycle.resignations.cancel",
  "employeeLifecycle.offboarding.cancel",
  "RESIGNATION",
  "OFFBOARDING",
].forEach((needle) => mustInclude("approval engine", approvalEngine, needle));

[
  "EmployeeExitRequestDialog",
  "employeeExitApi.create",
  "employeeExitApi.submit",
  "canApprove",
  "canReject",
  "canApply",
  "canComplete",
  "Login/session disable happens only through approved completion.",
].forEach((needle) => mustInclude("frontend page", page, needle));

[
  "Employee selector",
  "Operation Ownership",
  "Request type",
  "Notice waiver requested",
  "Final settlement handoff required",
  "Login disable review required",
].forEach((needle) => mustInclude("frontend dialog", dialog, needle));

[
  "Offboarding tasks",
  "Approval timeline",
  "Audit actions",
  "Apply error",
].forEach((needle) => mustInclude("frontend drawer", drawer, needle));

[
  "employeeExitApi",
  "/employees/exit-requests",
  "approve",
  "reject",
  "cancel",
  "apply",
  "complete",
  "tasks",
  "audit",
].forEach((needle) => mustInclude("frontend api", api, needle));

[
  "employeeExitApi.approve",
  "employeeExitApi.reject",
  "employeeExitApi.cancel",
  "RESIGNATION",
  "OFFBOARDING",
].forEach((needle) => mustInclude("approvals page", approvalsPage, needle));

[
  "employeeLifecycle.resignations.view",
  "employeeLifecycle.offboarding.view",
  "/offboarding",
].forEach((needle) => mustInclude("navigation/router", navigation + router, needle));

[
  "employeeLifecycle.resignations.createForOthers",
  "employeeLifecycle.resignations.viewOwn",
  "employeeLifecycle.offboarding.viewOwn",
  "employeeLifecycle.exitRequests.viewAll",
  "employeeLifecycle.offboarding.complete",
  "employeeLifecycle.offboarding.tasks.view",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employeeLifecycle.tasks.manage",
  "employeeLifecycle.audit.view",
].forEach((needle) => mustInclude("permissions", permissions, needle));

[
  "employee submits own resignation request",
  "approval_request is created with operation_type RESIGNATION",
  "HR/Admin creates offboarding request for another employee",
  "duplicate submit does not create duplicate approval requests",
  "normal employee cannot submit resignation/offboarding for another employee",
  "Operation Ownership execution target is enforced before apply",
  "final approval generates default offboarding tasks",
  "required tasks block final completion",
  "login disabled only at approved offboarding completion",
  "sessions revoked when login disabled",
  "generic approval route blocks RESIGNATION and OFFBOARDING",
  "employee sees own exit request only",
  "normal employee with viewOwn cannot see coworker request",
  "normal employee with resignation view permission does not automatically get company-wide view",
  "payroll settlement task resolves to PAYROLL_FUNCTION/FINANCE_FUNCTION department",
  "biometric task resolves to DEVICE_MANAGEMENT_FUNCTION department",
  "kiosk task resolves to KIOSK_FUNCTION department",
  "document handover resolves to DOCUMENT_KYC_FUNCTION department",
  "department handover resolves to subject employee department",
  "unassigned function creates manual assignment task warning",
  "unrelated executor cannot complete task",
  "payroll owner cannot complete biometric task",
  "future last working date does not set employee employment_status to resigned",
  "today last working date applies resignation",
  "APPROVED_PENDING_LAST_WORKING_DATE can move to applied after date arrives",
  "missing last working date holds for manual review",
  "login remains active during notice period",
  "assigned user can list/view assigned task",
  "owner department user can list/view owned task",
  "unrelated task owner cannot view task",
  "Exit / Offboarding page renders",
].forEach((needle) => mustInclude("tests", tests, needle));

if (page.includes("window.alert") || page.includes("window.confirm") || dialog.includes("window.alert") || dialog.includes("window.confirm")) {
  fail.push("frontend: browser alert/confirm usage detected");
}

if (fail.length) {
  console.error("Employee lifecycle approval engine verification failed:");
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Employee lifecycle approval engine verification passed.");
