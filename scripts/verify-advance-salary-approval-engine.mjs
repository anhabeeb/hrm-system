import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const includes = (label, text, token) => assert(text.includes(token), `${label} missing ${token}`);
const mustMatch = (label, text, pattern) => assert(pattern.test(text), `${label} did not match ${pattern}`);

const migrationPath = "migrations/0068_advance_salary_approval_engine.sql";
assert(existsSync(resolve(root, migrationPath)), "advance salary approval migration is missing.");
const migration = existsSync(resolve(root, migrationPath)) ? read(migrationPath) : "";
[
  "CREATE TABLE IF NOT EXISTS advance_salary_requests",
  "CREATE TABLE IF NOT EXISTS advance_salary_payment_ledger",
  "CREATE TABLE IF NOT EXISTS advance_salary_deduction_schedule",
  "approval_request_id",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_PAYMENT",
  "FAILED_TO_PAY",
  "advanceSalary.requests.createForOthers",
  "advanceSalary.payments.execute",
  "ADVANCE_SALARY_REQUEST_DEFAULT",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
].forEach((token) => includes("advance salary migration", migration, token));

const types = read("src/modules/advances/advance-salary.types.ts");
[
  "SALARY_ADVANCE",
  "EMERGENCY_ADVANCE",
  "MEDICAL_ADVANCE",
  "TRAVEL_ADVANCE",
  "FESTIVAL_ADVANCE",
  "LOAN_ADVANCE",
  "OTHER_ADVANCE",
  "ADVANCE_SALARY_REQUEST_OPERATION",
  "ADVANCE_SALARY_PAYMENT_OPERATION",
].forEach((token) => includes("advance salary types", types, token));

const validators = read("src/modules/advances/advance-salary.validators.ts");
[
  "api_key",
  "device_secret",
  "rejectSensitivePayload(nested",
  "requested_amount",
  "repayment_months",
].forEach((token) => includes("advance salary validators", validators, token));

const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "MODULE_BOUND_ADVANCE_SALARY_ACTION_MESSAGE",
  "Advance salary requests must be approved from the Advances module",
  "request.operation_type === \"ADVANCE_SALARY_REQUEST\"",
  "options.moduleOperationType === \"ADVANCE_SALARY_REQUEST\"",
  "input.operation_type === \"ADVANCE_SALARY_REQUEST\"",
  "advanceSalary.requests.createForOthers",
  "advanceSalary.requests.cancel",
  "advanceSalary.requests.cancelAny",
].forEach((token) => includes("approval engine advance salary safety", approvalService, token));

const service = read("src/modules/advances/advance-salary.service.ts");
[
  "canCreateAdvanceSalaryForEmployee",
  "buildAdvanceSalaryVisibilityFilter",
  "canViewAdvanceSalaryRequest",
  "createApprovalRequestDraft",
  "modulePermission: \"advanceSalary.requests.createForOthers\"",
  "moduleOperationType: ADVANCE_SALARY_REQUEST_OPERATION",
  "already_submitted: true",
  "approveStep(env, context, request.approval_request_id",
  "rejectStep(env, context, request.approval_request_id",
  "cancelRequest(env, context, request.approval_request_id",
  "moduleCancelPermission: \"advanceSalary.requests.cancel\"",
  "moduleCancelAnyPermission: \"advanceSalary.requests.cancelAny\"",
  "ADVANCE_SALARY_PAYMENT_OPERATION",
  "responsibility_type: \"EXECUTION\"",
  "assertAdvanceSalaryPaymentExecutionAllowed",
  "addMonthsToPayrollMonth",
  "buildAdvanceSalaryDeductionSchedule",
  "validateDeductionScheduleTotal",
  "resolved_department_id",
  "resolved_user_id",
  "min_level",
  "max_level",
  "required_role_id",
  "createPaymentBundle",
  "countDeductionSchedule",
  "ADVANCE_SALARY_PAYMENT_PARTIAL_STATE",
  "advance_salary_payment_executed",
].forEach((token) => includes("advance salary service", service, token));
assert(/existingLedger[\s\S]{0,500}request\.status === "PAID"[\s\S]{0,250}existingScheduleCount > 0/.test(service), "advance salary already_paid must require paid status and deduction schedule, not only payment ledger.");
assert(/for \(const deduction of deductions\)[\s\S]{0,180}assertPayrollMonthUnlocked/.test(service), "advance salary payment must prevalidate every generated deduction month.");

const repository = read("src/modules/advances/advance-salary.repository.ts");
[
  "findEmployeeByUserId",
  "findDuplicatePendingRequest",
  "createRequest",
  "updateApprovalLink",
  "updateRequestStatus",
  "createPaymentLedger",
  "findPaymentLedger",
  "countDeductionSchedule",
  "createDeductionSchedule",
  "createPaymentBundle",
  "env.DB.batch(statements)",
  "createLegacyApprovedAdvance",
  "advance_payments",
].forEach((token) => includes("advance salary repository", repository, token));

const routes = read("src/routes/advances.routes.ts");
[
  "/salary-requests",
  "/salary-requests/:id/submit",
  "/salary-requests/:id/approve",
  "/salary-requests/:id/reject",
  "/salary-requests/:id/cancel",
  "/salary-requests/:id/execute-payment",
  "/salary-requests/:id/deductions",
  "/salary-requests/:id/approval-timeline",
  "advanceSalary.requests.createForOthers",
  "advanceSalary.requests.review",
  "advanceSalary.requests.finalApprove",
  "advanceSalary.payments.execute",
  "approvals.operationExecutor.apply",
  "approvals.operationExecutor.view",
].forEach((token) => includes("advance salary routes", routes, token));
mustMatch(
  "advance salary list route operation executor permissions",
  routes,
  /salary-requests", requireAnyPermission\(\[[^\]]*"advanceSalary\.payments\.execute"[^\]]*"approvals\.operationExecutor\.view"[^\]]*"approvals\.operationExecutor\.apply"/s,
);
mustMatch(
  "advance salary detail route operation executor permissions",
  routes,
  /salary-requests\/:id", requireAnyPermission\(\[[^\]]*"advanceSalary\.payments\.execute"[^\]]*"approvals\.operationExecutor\.view"[^\]]*"approvals\.operationExecutor\.apply"/s,
);

const permissions = read("seeds/permissions.seed.sql");
[
  "advanceSalary.requests.view",
  "advanceSalary.requests.create",
  "advanceSalary.requests.createForOthers",
  "advanceSalary.requests.submit",
  "advanceSalary.requests.approve",
  "advanceSalary.requests.reject",
  "advanceSalary.requests.finalApprove",
  "advanceSalary.requests.cancel",
  "advanceSalary.requests.cancelAny",
  "advanceSalary.payments.execute",
].forEach((token) => includes("permission seed", permissions, token));

const advancesApi = read("frontend/src/features/advances/advances.api.ts");
[
  "listSalaryRequests",
  "createSalaryRequest",
  "submitSalaryRequest",
  "approveSalaryRequest",
  "rejectSalaryRequest",
  "cancelSalaryRequest",
  "executeSalaryPayment",
  "salaryRequestDeductions",
  "salaryRequestTimeline",
].forEach((token) => includes("frontend advances API", advancesApi, token));

const advancesPage = read("frontend/src/features/advances/AdvancesPage.tsx");
[
  "AdvanceSalaryRequestDialog",
  "AdvanceSalaryRequestsTable",
  "AdvanceSalaryDetailDrawer",
  "canCreateSalary",
  "canApproveSalary",
  "canRejectSalary",
  "canCancelSalary",
  "canExecuteSalary",
  "executeSalaryPayment",
].forEach((token) => includes("frontend advances page", advancesPage, token));
includes("frontend advance salary execute gate", advancesPage, "hasAdvancePermission(\"approvals.operationExecutor.apply\")");
assert(!/canExecuteSalary[\s\S]{0,180}approvals\.operationExecutor\.view/.test(advancesPage), "Execute payment action must not be shown for approvals.operationExecutor.view alone.");

const advanceDialog = read("frontend/src/features/advances/AdvanceSalaryRequestDialog.tsx");
[
  "EmployeeCombobox",
  "advancesApi.createSalaryRequest",
  "advancesApi.submitSalaryRequest",
  "Your advance salary request has been submitted for approval.",
  "SALARY_ADVANCE",
  "OTHER_ADVANCE",
  "canSelectEmployee ? (",
].forEach((token) => includes("frontend advance salary dialog", advanceDialog, token));

const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
[
  "operation_type === \"ADVANCE_SALARY_REQUEST\"",
  "advancesApi.approveSalaryRequest",
  "advancesApi.rejectSalaryRequest",
  "advancesApi.cancelSalaryRequest",
].forEach((token) => includes("frontend generic approvals advance salary path", approvalsPage, token));

const testsPath = "tests/advance-salary-approval-integration.test.ts";
assert(existsSync(resolve(root, testsPath)), "advance salary approval integration tests are missing.");
const tests = existsSync(resolve(root, testsPath)) ? read(testsPath) : "";
[
  "creates an ADVANCE_SALARY_REQUEST",
  "blocks normal employees from creating advance salary requests for another employee",
  "advanceSalary.requests.createForOthers",
  "does not create duplicate approval requests on repeated submit",
  "module-bound permissions",
  "final approval moves advance salary request to pending payment",
  "ADVANCE_SALARY_PAYMENT",
  "repayment_months=2 creates two rows",
  "crossing year boundary",
  "rounding remainder",
  "locked payroll month blocks schedule",
  "ledger exists but request is not paid causes manual review",
  "payment bundle failure marks request failed",
  "duplicate schedule rows block payment",
  "operation executor permission can execute",
  "operation executor apply permission can list and open",
  "operation executor view permission can view eligible pending-payment requests without execute permission",
  "operation executor route permission still cannot view outside the Operation Ownership execution target",
  "specific user, min/max level, and required role",
  "createLegacyApprovedAdvance",
  "another department",
  "api_key",
  "device_secret",
  "generic approval routes",
  "frontend uses advance-specific endpoints",
  "frontend create/submit",
].forEach((token) => includes("advance salary tests", tests, token));

const advanceDrawer = read("frontend/src/features/advances/AdvanceSalaryDetailDrawer.tsx");
[
  "Payment is recorded but deduction schedule needs review.",
  "Scheduled:",
  "Deducted:",
  "Payroll run:",
  "Payslip:",
].forEach((token) => includes("frontend advance salary deduction display", advanceDrawer, token));

const frontendSource = advancesPage + advanceDialog + read("frontend/src/features/advances/AdvanceSalaryRequestsTable.tsx") + advanceDrawer + approvalsPage;
assert(!/window\.alert\s*\(|\balert\s*\(/.test(frontendSource), "advance salary frontend reintroduced browser alert().");
assert(!/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource), "advance salary frontend reintroduced browser confirm().");

console.log("Advance salary approval engine verification");
console.log(`- migration: ${migrationPath}`);
console.log("- checked module-bound approval safety, payment execution ownership, payroll deduction bridge, frontend paths, and tests");

if (failures.length > 0) {
  console.error("Advance salary approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Advance salary approval engine verification passed.");
