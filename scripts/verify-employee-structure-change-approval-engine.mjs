import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const mustInclude = (label, content, needle) => {
  if (!content.includes(needle)) fail.push(`${label}: missing ${needle}`);
};

const migration = read("migrations/0072_employee_structure_change_approval_engine.sql");
const routes = read("src/routes/employees.routes.ts");
const service = read("src/modules/employee-structure/employee-structure-change.service.ts");
const repository = read("src/modules/employee-structure/employee-structure-change.repository.ts");
const validators = read("src/modules/employee-structure/employee-structure-change.validators.ts");
const types = read("src/modules/employee-structure/employee-structure-change.types.ts");
const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
const approvalTypes = read("src/modules/approvals/approval-workflow-engine.types.ts");
const page = read("frontend/src/features/employee-structure-change/EmployeeStructureChangeRequestsPage.tsx");
const dialog = read("frontend/src/features/employee-structure-change/EmployeeStructureChangeRequestDialog.tsx");
const api = read("frontend/src/features/employee-structure-change/employeeStructureChange.api.ts");
const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const router = read("frontend/src/app/router.tsx");
const permissions = read("seeds/permissions.seed.sql");
const tests = read("tests/employee-structure-change-approval-integration.test.ts");

[
  "employee_structure_change_requests",
  "employee_structure_change_request_items",
  "EMPLOYEE_TRANSFER",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "requested_department_id",
  "requested_position_id",
  "requested_level",
  "approval_request_id",
  "employees.structureRequests.createForOthers",
  "employees.structureRequests.apply",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
].forEach((needle) => mustInclude("migration", migration, needle));

[
  "employeesRoutes.get(",
  "/structure-change-requests",
  "/structure-change-requests/:requestId/submit",
  "/structure-change-requests/:requestId/approve",
  "/structure-change-requests/:requestId/reject",
  "/structure-change-requests/:requestId/cancel",
  "/structure-change-requests/:requestId/apply",
  "/structure-change-requests/:requestId/timeline",
  "/structure-change-requests/:requestId/items",
  "/structure-change-requests/:requestId/audit",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
  "approvals.operationExecutor.apply",
].forEach((needle) => mustInclude("routes", routes, needle));

[
  "canCreateForEmployee",
  "Department managers can create structure requests only for lower-level employees",
  "assertDepartmentScopedTargetAllowed",
  "Department managers cannot request assigning employees to their own or a higher level",
  "employees.structure.sensitive.manage",
  "normalizeTarget",
  "requestedLevel = position.level",
  "buildEmployeeStructureChangeVisibilityFilter",
  "canViewEmployeeStructureChangeRequest",
  "assertCurrentStructureStillMatches",
  "STALE_EMPLOYEE_STRUCTURE",
  "employee_structure_change_stale_state",
  "allowModuleBoundCreateForOthers",
  "modulePermission: \"employees.structureRequests.createForOthers\"",
  "already_submitted",
  "moduleCancelPermission: \"employees.structureRequests.cancel\"",
  "resolveOperationResponsibility",
  "assertEmployeeStructureExecutionAllowed",
  "canRequestRoleTemplateApply",
  "prevalidateRoleTemplateApplication",
  "Structure was updated, but no login user exists, so role template was not applied.",
  "This request includes role template application, but you do not have permission to apply role templates.",
  "Reporting manager changes are not supported",
  "employees.structureRequests.apply",
  "approvals.operationExecutor.apply",
  "PENDING_MANUAL_REVIEW",
  "FAILED_TO_APPLY",
  "baseStructureService.applyLevelRoleTemplate",
  "getEmployeeStructureChangeTimeline",
  "requested_store_id",
  "requested_department_head_employee_id",
  "listEmployeeStructureChangeItems",
  "getEmployeeStructureChangeAudit",
  "Please provide at least one actionable",
].forEach((needle) => mustInclude("service", service, needle));

[
  "env.DB.batch(statements)",
  "UPDATE employees",
  "employee_structure_history",
  "effective_to IS NULL",
  "findDuplicatePendingRequest",
  "findOutlet",
  "applyApprovedStructureChange",
  "UPDATE departments SET head_employee_id",
  "findLinkedUserForEmployee",
  "countLevelRoleTemplates",
  "listRequestItems",
  "primary_outlet_id = COALESCE",
].forEach((needle) => mustInclude("repository", repository, needle));

[
  "DEPARTMENT_TRANSFER",
  "OUTLET_TRANSFER",
  "POSITION_TRANSFER",
  "POSITION_TITLE_CHANGE",
  "LEVEL_CHANGE",
  "ROLE_TEMPLATE_REAPPLY",
  "PENDING_APPLICATION",
  "FAILED_TO_APPLY",
].forEach((needle) => mustInclude("types", types, needle));

[
  "assertSafeEmployeeStructurePayload",
  "api_key",
  "device_secret",
  "requested_outlet_id: asString(input.requested_outlet_id) ?? asString(input.requested_store_id)",
  "deriveOperationType",
].forEach((needle) => mustInclude("validators", validators, needle));

[
  "EMPLOYEE_STRUCTURE_CHANGE",
].forEach((needle) => mustInclude("approval types", approvalTypes, needle));

[
  "MODULE_BOUND_EMPLOYEE_STRUCTURE_ACTION_MESSAGE",
  "employees.structureRequests.createForOthers",
  "employees.structureRequests.cancel",
  "EMPLOYEE_TRANSFER",
  "EMPLOYEE_STRUCTURE_CHANGE",
].forEach((needle) => mustInclude("approval engine", approvalEngine, needle));

[
  "EmployeeStructureChangeRequestsPage",
  "employeeStructureChangeApi.create",
  "employeeStructureChangeApi.submit",
  "canApprove",
  "canReject",
  "canApply",
  "employees.structureRequests.apply",
].forEach((needle) => mustInclude("frontend page", page, needle));

[
  "Employee selector",
  "Department selector",
  "Position / title selector",
  "Level is derived by the backend",
  "Requested level:",
  "Effective date",
  "Role template application is available only to authorized HR/access administrators",
  "Submit for approval",
].forEach((needle) => mustInclude("frontend dialog", dialog, needle));
if (dialog.includes("window.alert") || dialog.includes("window.confirm")) fail.push("frontend dialog: browser alert/confirm usage detected");

[
  "employeeStructureChangeApi",
  "approve",
  "reject",
  "cancel",
  "items",
  "audit",
  "/employees/structure-change-requests",
].forEach((needle) => mustInclude("frontend api", api, needle));

[
  "employeeStructureChangeApi.approve",
  "EMPLOYEE_TRANSFER",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "employees.structureRequests.review",
  "employees.structureRequests.finalApprove",
].forEach((needle) => mustInclude("approvals page", approvalsPage, needle));

[
  "Structure Change Requests",
  "/organization/structure-change-requests",
  "employees.structureRequests.view",
].forEach((needle) => mustInclude("navigation/router", navigation + router, needle));

[
  "employees.structureRequests.view",
  "employees.structureRequests.create",
  "employees.structureRequests.createForOthers",
  "employees.structureRequests.review",
  "employees.structureRequests.finalApprove",
  "employees.structureRequests.reject",
  "employees.structureRequests.cancelAny",
  "employees.structureRequests.apply",
].forEach((needle) => mustInclude("permissions", permissions, needle));

[
  "normal employee cannot create structure change for another employee",
  "department manager can create for lower-level same-department employee",
  "department manager cannot create for another department or same level",
  "submit is idempotent and does not create duplicate approval requests",
  "generic approval route blocks EMPLOYEE_TRANSFER and EMPLOYEE_STRUCTURE_CHANGE",
  "final apply updates employee structure and writes employee_structure_history",
  "Operation Ownership execution target is enforced",
  "role template reapply is add-only and preserves custom roles",
  "frontend create flow uses employeeStructureChangeApi.create and submit",
  "frontend approvals page dispatches module-bound employee structure actions",
  "store transfer is normalized to outlet/store assignment",
  "reporting manager changes are rejected until schema-backed",
  "role template application requires access administration permission",
  "department head change applies through departments.head_employee_id",
  "stale current structure is held before apply",
  "apply_role_template request is blocked or held if executor lacks permission",
  "employee with no linked user gets warning and structure still applies",
  "items endpoint returns request item diffs with row-level visibility",
  "audit endpoint is timeline-backed",
].forEach((needle) => mustInclude("tests", tests, needle));

const frontendSource = fs.readdirSync(path.join(root, "frontend", "src"), { recursive: true })
  .filter((file) => String(file).endsWith(".ts") || String(file).endsWith(".tsx"))
  .map((file) => read(path.join("frontend", "src", String(file))));
if (frontendSource.some((content) => /\b(window\.)?alert\s*\(/.test(content) || /\b(window\.)?confirm\s*\(/.test(content))) {
  fail.push("frontend: browser alert/confirm usage detected");
}

if (fail.length > 0) {
  console.error("Employee structure change approval engine verification failed:");
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Employee structure change approval engine verification passed.");
