import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const mustInclude = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label}: missing ${needle}`);
};

const mustNotInclude = (label, content, needle) => {
  if (content.includes(needle)) failures.push(`${label}: must not include ${needle}`);
};

const migration = `${read("migrations/0075_employee_disciplinary_action_approval_engine.sql")}\n${read("migrations/0076_disciplinary_action_lifecycle_hardening.sql")}`;
const packageJson = read("package.json");
const app = read("src/app.ts");
const routes = read("src/routes/employee-discipline.routes.ts");
const service = read("src/modules/employee-discipline/employee-discipline.service.ts");
const repository = read("src/modules/employee-discipline/employee-discipline.repository.ts");
const validators = read("src/modules/employee-discipline/employee-discipline.validators.ts");
const types = read("src/modules/employee-discipline/employee-discipline.types.ts");
const controller = read("src/modules/employee-discipline/employee-discipline.controller.ts");
const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const page = read("frontend/src/features/discipline/DisciplinaryActionsPage.tsx");
const dialog = read("frontend/src/features/discipline/DisciplinaryActionDialog.tsx");
const table = read("frontend/src/features/discipline/DisciplinaryActionsTable.tsx");
const drawer = read("frontend/src/features/discipline/DisciplinaryActionDetailDrawer.tsx");
const api = read("frontend/src/features/discipline/discipline.api.ts");
const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const router = read("frontend/src/app/router.tsx");
const tests = read("tests/disciplinary-action-approval-integration.test.ts");

[
  "employee_disciplinary_action_requests",
  "employee_disciplinary_action_items",
  "employee_disciplinary_records",
  "employee_disciplinary_follow_up_tasks",
  "DISCIPLINARY_ACTION",
  "approval_request_id",
  "source_request_id",
  "acknowledgement_required",
  "follow_up_required",
  "idx_employee_discipline_active_guard",
  "idx_employee_discipline_record_once",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
  "employeeDiscipline.actions.createForOthers",
  "employeeDiscipline.actions.finalApprove",
  "employeeDiscipline.actions.apply",
  "employeeDiscipline.actions.close",
  "employeeDiscipline.records.viewOwn",
  "employeeDiscipline.records.viewAll",
  "employeeDiscipline.tasks.complete",
  "employeeDiscipline.acknowledge",
].forEach((needle) => mustInclude("migration", migration, needle));

[
  "disciplinary-action-approval-engine",
].forEach((needle) => mustInclude("package scripts", packageJson, needle));

[
  "employeeDisciplineRoutes",
  "/employee-discipline",
].forEach((needle) => mustInclude("app route mount", app, needle));

[
  "/actions",
  "/actions/:requestId/submit",
  "/actions/:requestId/approve",
  "/actions/:requestId/reject",
  "/actions/:requestId/cancel",
  "/actions/:requestId/apply",
  "/actions/:requestId/acknowledge",
  "/actions/:requestId/close",
  "/actions/:requestId/timeline",
  "/actions/:requestId/audit",
  "/actions/:requestId/items",
  "/actions/:requestId/tasks",
  "/actions/:requestId/tasks/:taskId/complete",
  "/actions/:requestId/tasks/:taskId/waive",
  "/records",
  "/records/:recordId",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
  "approvals.operationExecutor.apply",
  "employeeDiscipline.tasks.complete",
].forEach((needle) => mustInclude("routes", routes, needle));

[
  "createDisciplinaryAction",
  "submitDisciplinaryActionForApproval",
  "approveDisciplinaryActionStep",
  "rejectDisciplinaryActionStep",
  "cancelDisciplinaryAction",
  "applyApprovedDisciplinaryAction",
  "acknowledgeDisciplinaryAction",
  "closeDisciplinaryAction",
  "buildDisciplinaryActionVisibilityFilter",
  "buildDisciplinaryRecordVisibilityFilter",
  "canViewDisciplinaryAction",
  "canViewDisciplinaryRecord",
  "listDisciplinaryRecords",
  "getDisciplinaryRecord",
  "canCreateForEmployee",
  "Department-scoped creators can only create disciplinary actions for lower-level employees",
  "createApprovalRequestDraft",
  "submitApprovalRequest",
  "approveStep",
  "rejectStep",
  "cancelRequest",
  "already_submitted",
  "resolveOperationResponsibility",
  "assertDisciplinaryExecutionAllowed",
  "employeeDiscipline.actions.apply",
  "approvals.operationExecutor.apply",
  "createOfficialRecord",
  "ensureFollowUpTasks",
  "PAYROLL_FUNCTION",
  "GENERAL_ADMIN_FUNCTION",
  "DOCUMENT_KYC_FUNCTION",
  "training_follow_up_required",
  "payroll_follow_up_required",
  "offboarding_follow_up_required",
  "canActOnTask",
  "employeeDiscipline.tasks.complete",
  "employeeDiscipline.tasks.waive",
  "official record is created only after final approval",
  "Official disciplinary record must exist before acknowledgement",
  "acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task",
  "Only applied or acknowledged disciplinary actions can be closed",
  "Official disciplinary record must exist before closing",
  "no already_applied success on partial state",
  "DISCIPLINARY_APPLY_PARTIAL_FAILURE",
  "PENDING_MANUAL_REVIEW",
].forEach((needle) => mustInclude("service", service, needle));

[
  "findDuplicateActiveRequest",
  "createRequest",
  "updateRequestApprovalLink",
  "createOfficialRecord",
  "findOfficialRecordById",
  "listOfficialRecords",
  "updateOfficialRecordAcknowledgement",
  "updateOfficialRecordStatus",
  "createFollowUpTasks",
  "countOpenRequiredTasks",
  "updateTaskStatus",
  "completeTaskByType",
  "listItems",
].forEach((needle) => mustInclude("repository", repository, needle));

[
  "VERBAL_WARNING",
  "WRITTEN_WARNING",
  "SUSPENSION",
  "SUSPENSION_RECOMMENDATION",
  "FINAL_WARNING",
  "TERMINATION_RECOMMENDATION",
  "PERFORMANCE_IMPROVEMENT_PLAN",
  "POLICY_VIOLATION",
  "ATTENDANCE_VIOLATION",
  "CONDUCT_VIOLATION",
  "SAFETY_VIOLATION",
  "HARASSMENT_COMPLAINT",
  "INVESTIGATION",
  "TRAINING_REQUIRED",
  "PAYROLL_REVIEW",
  "OFFBOARDING_REVIEW",
].forEach((needle) => mustInclude("types", types, needle));

[
  "assertSafeDisciplinaryPayload",
  "api_key",
  "device_secret",
  "incident_date cannot be in the future",
  "Sensitive outcomes require medium or high severity",
].forEach((needle) => mustInclude("validators", validators, needle));

[
  "listDisciplinaryActions",
  "listDisciplinaryRecords",
  "getDisciplinaryRecord",
  "disciplinaryItems",
  "disciplinaryTasks",
  "disciplinaryAudit",
].forEach((needle) => mustInclude("controller", controller, needle));

[
  "MODULE_BOUND_DISCIPLINARY_ACTION_MESSAGE",
  "generic approval route blocks DISCIPLINARY_ACTION",
  "employeeDiscipline.actions.createForOthers",
  "employeeDiscipline.actions.cancel",
  "DISCIPLINARY_ACTION",
].forEach((needle) => mustInclude("approval engine", approvalEngine, needle));

[
  "employeeDiscipline.actions.view",
  "employeeDiscipline.actions.viewOwn",
  "employeeDiscipline.actions.createForOthers",
  "employeeDiscipline.actions.finalApprove",
  "employeeDiscipline.actions.apply",
  "employeeDiscipline.actions.close",
  "employeeDiscipline.records.viewOwn",
  "employeeDiscipline.records.viewAll",
  "employeeDiscipline.tasks.complete",
  "employeeDiscipline.acknowledge",
].forEach((needle) => mustInclude("permissions", `${permissions}\n${roles}`, needle));

[
  "DisciplinaryActionDialog",
  "DisciplinaryActionsTable",
  "DisciplinaryActionDetailDrawer",
  "canApprove",
  "canReject",
  "canApply",
  "canAcknowledge",
].forEach((needle) => mustInclude("frontend page", page, needle));

[
  "EmployeeCombobox",
  "disciplineApi.create",
  "disciplineApi.submit",
  "Request type",
  "Recommended outcome",
  "Severity",
  "Employee acknowledgement required",
  "Payroll review follow-up",
  "Offboarding review follow-up",
].forEach((needle) => mustInclude("frontend dialog", dialog, needle));

[
  "Disciplinary record",
  "Approval timeline",
  "Follow-up tasks",
  "Acknowledged",
].forEach((needle) => mustInclude("frontend drawer", drawer, needle));

[
  "RowActions",
  "Approve",
  "Apply",
  "Acknowledge",
  "PENDING_ACKNOWLEDGEMENT",
  "PENDING_FOLLOW_UP",
].forEach((needle) => mustInclude("frontend table", table, needle));

[
  "disciplineApi",
  "/employee-discipline/actions",
  "/employee-discipline/records",
  "items",
  "approve",
  "reject",
  "cancel",
  "apply",
  "acknowledge",
  "tasks",
  "timeline",
].forEach((needle) => mustInclude("frontend api", api, needle));

[
  "disciplineApi.approve",
  "disciplineApi.reject",
  "disciplineApi.cancel",
  "DISCIPLINARY_ACTION",
  "employeeDiscipline.actions.finalApprove",
].forEach((needle) => mustInclude("generic approvals page", approvalsPage, needle));

[
  "/disciplinary-actions",
  "DisciplinaryActionsPage",
  "employeeDiscipline.actions.view",
].forEach((needle) => mustInclude("navigation/router", `${navigation}\n${router}`, needle));

mustNotInclude("discipline frontend", `${page}\n${dialog}\n${table}\n${drawer}`, "window.alert");
mustNotInclude("discipline frontend", `${page}\n${dialog}\n${table}\n${drawer}`, "window.confirm");
mustNotInclude("discipline frontend", `${page}\n${dialog}\n${table}\n${drawer}`, "alert(");
mustNotInclude("discipline frontend", `${page}\n${dialog}\n${table}\n${drawer}`, "confirm(");

[
  "employee can submit self disciplinary acknowledgement response",
  "HR/Admin can create disciplinary action for employee",
  "department manager cannot create for same or higher level employee",
  "approval_request is created with operation_type DISCIPLINARY_ACTION",
  "generic approval route blocks DISCIPLINARY_ACTION",
  "official record is created only after final approval and execution check",
  "payroll/offboarding outcomes create follow-up tasks",
  "acknowledgement is tracked without mutating employee status",
  "acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task",
  "close requires official record and applied state",
  "employee can view own official disciplinary record",
  "FINAL_WARNING treated as sensitive",
  "SUSPENSION treated as sensitive",
  "TERMINATION_RECOMMENDATION treated as sensitive",
  "official record without applied request status results in manual review",
  "operation owner/final/executor permissions are honored",
  "normal employee sees own disciplinary actions only",
].forEach((needle) => mustInclude("tests", tests, needle));

if (failures.length) {
  console.error("Disciplinary action approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Disciplinary action approval engine verification passed.");
