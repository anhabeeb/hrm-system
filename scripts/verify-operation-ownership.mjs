import { existsSync, readFileSync } from "node:fs";

const fail = (message) => {
  console.error(`Operation ownership verification failed:\n- ${message}`);
  process.exit(1);
};

const read = (path) => {
  if (!existsSync(path)) fail(`${path} is missing`);
  return readFileSync(path, "utf8");
};

const requireIncludes = (label, content, needles) => {
  const missing = needles.filter((needle) => !content.includes(needle));
  if (missing.length > 0) fail(`${label} is missing required markers: ${missing.join(", ")}`);
};

const requireRegex = (label, content, pattern, message) => {
  if (!pattern.test(content)) fail(`${label} ${message}`);
};

const migration65 = read("migrations/0065_operation_ownership_responsibility_matrix.sql");
const migration66 = read("migrations/0066_operation_ownership_matrix_completion.sql");
const migrations = `${migration65}\n${migration66}`;

requireIncludes("operation ownership base migration", migration65, [
  "CREATE TABLE IF NOT EXISTS business_functions",
  "CREATE TABLE IF NOT EXISTS business_function_department_assignments",
  "CREATE TABLE IF NOT EXISTS operation_catalog",
  "CREATE TABLE IF NOT EXISTS operation_responsibility_matrix",
]);

requireIncludes("operation ownership completion migration", migration66, [
  "ADD COLUMN target_type TEXT",
  "ADD COLUMN min_level INTEGER",
  "ADD COLUMN max_level INTEGER",
  "ADD COLUMN required_permission TEXT",
  "ADD COLUMN required_role_id TEXT",
  "ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0",
  "ADD COLUMN use_requester_department INTEGER NOT NULL DEFAULT 0",
  "ADD COLUMN use_subject_department INTEGER NOT NULL DEFAULT 0",
  "FINAL_APPROVER",
  "FINAL_APPROVAL",
  "EXECUTOR",
  "EXECUTION",
  "CONFIGURATION_OWNER",
  "CONFIGURATION",
]);

const canonicalOperations = [
  "EMPLOYEE_CREATE",
  "EMPLOYEE_UPDATE",
  "EMPLOYEE_ARCHIVE",
  "EMPLOYEE_LOGIN_ASSIGNMENT",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "EMPLOYEE_TRANSFER",
  "LEAVE_REQUEST",
  "LEAVE_BALANCE_ADJUSTMENT",
  "ATTENDANCE_CORRECTION",
  "ATTENDANCE_MANUAL_ENTRY",
  "ATTENDANCE_OVERRIDE",
  "ROSTER_CHANGE",
  "ROSTER_PUBLISH",
  "ROSTER_UNPUBLISH",
  "ROSTER_LOCK",
  "PAYROLL_ADJUSTMENT",
  "PAYROLL_RUN",
  "PAYROLL_FINALIZE",
  "PAYROLL_REOPEN",
  "ADVANCE_SALARY_REQUEST",
  "ADVANCE_SALARY_PAYMENT",
  "PAYSLIP_GENERATE",
  "PAYSLIP_PUBLISH",
  "DOCUMENT_KYC_UPDATE",
  "DOCUMENT_APPROVAL",
  "BIOMETRIC_DEVICE_CONFIG",
  "BIOMETRIC_EMPLOYEE_MAPPING",
  "BIOMETRIC_PUNCH_REPROCESS",
  "KIOSK_CONFIG",
  "REPORT_EXPORT",
  "AUDIT_LOG_VIEW",
  "SYSTEM_SETTINGS_CHANGE",
  "SECURITY_SETTINGS_CHANGE",
  "ROLE_PERMISSION_CHANGE",
  "RESIGNATION",
  "OFFBOARDING",
  "DISCIPLINARY_ACTION",
  "GENERIC_REQUEST",
];
requireIncludes("operation catalog seed", migrations, canonicalOperations);

const types = read("src/modules/operation-ownership/operation-ownership.types.ts");
requireIncludes("operation ownership types", types, [
  "OPERATION_RESPONSIBILITY_TYPES",
  "REQUEST_REVIEW",
  "DEPARTMENT_REVIEW",
  "FINAL_APPROVAL",
  "SECONDARY_APPROVAL",
  "EXECUTION",
  "CONFIGURATION",
  "AUDIT_VIEW",
  "ESCALATION",
  "OPERATION_TARGET_TYPES",
  "BUSINESS_FUNCTION",
  "DEPARTMENT",
  "SPECIFIC_USER",
  "REQUESTER_DEPARTMENT",
  "SUBJECT_DEPARTMENT",
  "SUPER_ADMIN",
  "target_type",
  "min_level",
  "max_level",
  "required_permission",
  "required_role_id",
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "BLOCK_OPERATION",
  "SKIP_OPTIONAL_STEP",
  "FALLBACK_TO_SUPER_ADMIN",
  "FALLBACK_TO_OWNER",
  "BLOCKED",
]);

const validators = read("src/modules/operation-ownership/operation-ownership.validators.ts");
requireIncludes("operation ownership validators", validators, [
  "OPERATION_TARGET_TYPES",
  "target_type",
  "min_level",
  "max_level",
  "required_permission",
  "required_role_id",
  "BUSINESS_FUNCTION",
  "REQUESTER_DEPARTMENT",
  "SUBJECT_DEPARTMENT",
  "SUPER_ADMIN",
]);
requireRegex("operation ownership validators", validators, /min_level[\s\S]*max_level|Maximum level|Minimum level/, "must validate level range");

const repository = read("src/modules/operation-ownership/operation-ownership.repository.ts");
requireIncludes("operation ownership repository", repository, [
  "findActiveResponsibilities",
  "target_type",
  "min_level",
  "max_level",
  "required_permission",
  "required_role_id",
  "setBusinessFunctionStatus",
  "setFunctionAssignmentStatus",
  "setOperationStatus",
  "setResponsibilityStatus",
  "listOperationsWithoutOwner",
  "listSensitiveOperationsWithoutFinalApproval",
  "listFunctionAssignmentsWithInactiveDepartments",
  "listResponsibilitiesWithInactiveDepartments",
  "listResponsibilitiesWithDisabledUsers",
  "listResponsibilitiesWithFallbacks",
  "listSensitiveFinalApprovalsWithoutPermission",
  "listFinalApprovalResponsibilitiesWithoutLevelApprover",
  "listDepartmentApproversForOperation",
  "input.minLevel",
  "input.maxLevel",
  "input.permissionKey",
  "input.roleId",
]);

const service = read("src/modules/operation-ownership/operation-ownership.service.ts");
requireIncludes("operation ownership service", service, [
  "resolveOperationResponsibility",
  "validateResponsibilityTarget",
  "target_type",
  "BUSINESS_FUNCTION",
  "DEPARTMENT",
  "SPECIFIC_USER",
  "REQUESTER_DEPARTMENT",
  "SUBJECT_DEPARTMENT",
  "SUPER_ADMIN",
  "findEmployeeStructure",
  "findSuperAdminUser",
  "resolved_department_id",
  "resolved_business_function_code",
  "resolved_user_id",
  "required_permission",
  "required_role_id",
  "min_level",
  "max_level",
  "fallback_applied",
  "buildResponsibilityUpdate",
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "BLOCK_OPERATION",
  "SKIP_OPTIONAL_STEP",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "SENSITIVE_FINAL_APPROVAL_MISSING",
  "BUSINESS_FUNCTION_INACTIVE_DEPARTMENT",
  "RESPONSIBILITY_INACTIVE_DEPARTMENT",
  "RESPONSIBILITY_DISABLED_USER",
  "SUPER_ADMIN_FALLBACK_CONFIGURED",
  "BLOCK_OPERATION_FALLBACK_CONFIGURED",
  "SENSITIVE_FINAL_APPROVAL_PERMISSION_MISSING",
  "FINAL_APPROVAL_LEVEL_APPROVER_MISSING",
]);
requireRegex("operation ownership service", service, /targetCount\s*>\s*1/, "must reject multiple target models");
requireRegex("operation ownership service", service, /min_level[\s\S]*max_level[\s\S]*greater than maximum level/, "must reject invalid level ranges");
requireRegex("operation ownership service", service, /targetType === "BUSINESS_FUNCTION"[\s\S]*department_id = null[\s\S]*user_id = null/, "must clear incompatible target fields when switching to business function");
requireRegex("operation ownership service", service, /targetType === "REQUESTER_DEPARTMENT"[\s\S]*business_function_id = null[\s\S]*use_requester_department = true/, "must support requester department target switching");

const routes = read("src/routes/operation-ownership.routes.ts");
requireIncludes("operation ownership routes", routes, [
  "/business-functions/:id",
  "/business-functions/:id/disable",
  "/business-functions/:id/enable",
  "/business-functions/:id/archive",
  "/function-assignments/:id/disable",
  "/function-assignments/:id/enable",
  "/function-assignments/:id/archive",
  "/operations/:operationCode",
  "/operations/:operationCode/disable",
  "/operations/:operationCode/enable",
  "/operations/:operationCode/archive",
  "/responsibilities/:id",
  "/responsibilities/:id/disable",
  "/responsibilities/:id/enable",
  "/responsibilities/:id/archive",
  "/operations/:operationCode/responsibilities",
  "/resolve",
  "/matrix-summary",
  "/setup-warnings",
]);

requireIncludes("app route", read("src/app.ts"), [
  "operationOwnershipRoutes",
  "/operation-ownership",
]);

const approvalResolver = read("src/modules/approvals/approval-approver-resolver.service.ts");
requireIncludes("approval resolver hook", approvalResolver, [
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
  "OPERATION_EXECUTOR",
  "OPERATION_CONFIGURATION_OWNER",
  "OPERATION_ESCALATION",
  "resolveOperationResponsibility",
  "FINAL_APPROVAL",
  "resolution.min_level",
  "resolution.max_level",
  "resolution.required_permission",
  "resolution.required_role_id",
]);
requireIncludes("approval resolver types", read("src/modules/approvals/approval-workflow-engine.types.ts"), [
  "BUSINESS_FUNCTION_DEPARTMENT",
  "OPERATION_CONFIGURATION_OWNER",
]);

requireIncludes("operation ownership permissions", read("seeds/permissions.seed.sql"), [
  "operationOwnership.view",
  "operationOwnership.manage",
  "operationOwnership.matrix.manage",
  "operationOwnership.sensitive.manage",
]);

const frontendPage = read("frontend/src/features/operation-ownership/OperationOwnershipPage.tsx");
requireIncludes("operation ownership frontend page", frontendPage, [
  "Business Functions",
  "Function Assignments",
  "Operation Matrix",
  "Setup Warnings",
  "OperationResponsibilityDialog",
  "BusinessFunctionDialog",
  "FunctionAssignmentDialog",
  "OperationResolveDialog",
  "Create Business Function",
  "Assign Function",
  "matrixFilters",
]);

const frontendDialog = read("frontend/src/features/operation-ownership/OperationResponsibilityDialog.tsx");
requireIncludes("operation responsibility dialog", frontendDialog, [
  "Target type",
  "Business function",
  "Department",
  "Specific user",
  "Min level",
  "Max level",
  "Required permission",
  "Required role",
  "Requires approval",
  "Reason/comment",
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "BLOCK_OPERATION",
  "SKIP_OPTIONAL_STEP",
]);
if (frontendDialog.includes("Department ID")) fail("operation responsibility dialog must use a department selector, not raw Department ID input");

const businessFunctionDialog = read("frontend/src/features/operation-ownership/BusinessFunctionDialog.tsx");
requireIncludes("business function dialog", businessFunctionDialog, [
  "Create Business Function",
  "Edit Business Function",
  "Sensitive",
  "Active status",
]);

const functionAssignmentDialog = read("frontend/src/features/operation-ownership/FunctionAssignmentDialog.tsx");
requireIncludes("function assignment dialog", functionAssignmentDialog, [
  "Assign Business Function",
  "Business function selector",
  "Department selector",
  "Assignment type",
  "Primary",
]);
if (functionAssignmentDialog.includes("Department ID")) fail("function assignment dialog must use a department selector, not raw Department ID input");

[
  "frontend/src/features/operation-ownership/BusinessFunctionsTable.tsx",
  "frontend/src/features/operation-ownership/BusinessFunctionDialog.tsx",
  "frontend/src/features/operation-ownership/FunctionAssignmentsTable.tsx",
  "frontend/src/features/operation-ownership/FunctionAssignmentDialog.tsx",
  "frontend/src/features/operation-ownership/OperationMatrixTable.tsx",
  "frontend/src/features/operation-ownership/OperationCatalogTable.tsx",
  "frontend/src/features/operation-ownership/SetupWarningsPanel.tsx",
  "frontend/src/features/operation-ownership/OperationResolveDialog.tsx",
].forEach((path) => {
  if (!existsSync(path)) fail(`${path} is missing`);
});

requireIncludes("operation ownership frontend api", read("frontend/src/features/operation-ownership/operation-ownership.api.ts"), [
  "/operation-ownership/business-functions",
  "/operation-ownership/function-assignments",
  "/operation-ownership/operations",
  "/operation-ownership/responsibilities",
  "/operation-ownership/resolve",
  "disableResponsibility",
  "enableResponsibility",
  "archiveResponsibility",
  "createBusinessFunction",
  "updateBusinessFunction",
  "disableBusinessFunction",
  "createFunctionAssignment",
  "updateFunctionAssignment",
  "disableFunctionAssignment",
]);
requireIncludes("operation ownership navigation", read("frontend/src/lib/navigation.ts"), [
  "Operation Ownership",
  "operationOwnership.matrix.view",
]);
requireIncludes("operation ownership router", read("frontend/src/app/router.tsx"), [
  "OperationOwnershipPage",
  "/organization/operation-ownership",
]);

const tests = read("tests/operation-ownership.test.ts");
requireIncludes("operation ownership tests", tests, [
  "target_type",
  "min_level",
  "max_level",
  "REQUESTER_DEPARTMENT",
  "SUBJECT_DEPARTMENT",
  "SUPER_ADMIN",
  "rejects missing target type",
  "rejects multiple static targets",
  "seeds all canonical operation codes",
  "integrates operation final approver",
  "switches BUSINESS_FUNCTION responsibility to DEPARTMENT",
  "clearing required permission",
  "USE_OWNER resolves owner responsibility",
  "USE_FINAL_APPROVAL_DEPARTMENT resolves final approval responsibility",
  "SKIP_OPTIONAL_STEP",
  "builds setup warnings for final approval",
  "adds business function and function assignment management dialogs",
]);

const frontendSource = [
  "frontend/src/features/operation-ownership/OperationOwnershipPage.tsx",
  "frontend/src/features/operation-ownership/OperationResponsibilityDialog.tsx",
  "frontend/src/features/operation-ownership/BusinessFunctionDialog.tsx",
  "frontend/src/features/operation-ownership/FunctionAssignmentDialog.tsx",
  "frontend/src/features/operation-ownership/OperationMatrixTable.tsx",
].map(read).join("\n");
if (/window\.alert\(|window\.confirm\(|\balert\(|\bconfirm\(/.test(frontendSource)) {
  fail("operation ownership frontend must not use browser alert/confirm");
}

console.log("Operation ownership verification passed.");
