import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const includes = (label, text, token) => assert(text.includes(token), `${label} missing ${token}`);

const migrationPath = "migrations/0067_payroll_adjustment_approval_engine.sql";
assert(existsSync(resolve(root, migrationPath)), "payroll adjustment approval migration is missing.");
const migration = existsSync(resolve(root, migrationPath)) ? read(migrationPath) : "";
[
  "CREATE TABLE IF NOT EXISTS payroll_adjustment_requests",
  "CREATE TABLE IF NOT EXISTS payroll_adjustment_applied_ledger",
  "approval_request_id",
  "PENDING_EXECUTION",
  "PENDING_MANUAL_REVIEW",
  "FAILED_TO_APPLY",
  "idx_payroll_adjustments_approval",
  "payroll.adjustments.createForOthers",
  "PAYROLL_ADJUSTMENT_DEFAULT",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
].forEach((token) => includes("payroll adjustment migration", migration, token));

const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
[
  "MODULE_BOUND_PAYROLL_ADJUSTMENT_ACTION_MESSAGE",
  "Payroll adjustments must be approved from the Payroll module",
  "request.operation_type === \"PAYROLL_ADJUSTMENT\"",
  "options.moduleOperationType === \"PAYROLL_ADJUSTMENT\"",
  "input.operation_type === \"PAYROLL_ADJUSTMENT\"",
  "payroll.adjustments.createForOthers",
  "payroll.adjustments.cancel",
  "payroll.adjustments.cancelAny",
].forEach((token) => includes("approval engine payroll safety", approvalService, token));

const service = read("src/modules/payroll/payroll-adjustments.service.ts");
[
  "PAYROLL_ADJUSTMENT_OPERATION",
  "canCreatePayrollAdjustmentForEmployee",
  "assertPayrollAdjustmentExecutionAllowed",
  "buildPayrollAdjustmentVisibilityFilter",
  "canViewPayrollAdjustment",
  "createApprovalRequestDraft",
  "modulePermission: \"payroll.adjustments.createForOthers\"",
  "moduleOperationType: PAYROLL_ADJUSTMENT_OPERATION",
  "already_submitted: true",
  "approveStep(env, context, adjustment.approval_request_id",
  "rejectStep(env, context, adjustment.approval_request_id",
  "cancelRequest(env, context, adjustment.approval_request_id",
  "moduleCancelPermission: \"payroll.adjustments.cancel\"",
  "moduleCancelAnyPermission: \"payroll.adjustments.cancelAny\"",
  "resolveOperationResponsibility",
  "responsibility_type: \"EXECUTION\"",
  "resolved_department_id",
  "resolved_user_id",
  "min_level",
  "max_level",
  "required_role_id",
  "PENDING_MANUAL_REVIEW",
  "PAYROLL_ADJUSTMENT_APPROVED_NOT_APPLIED",
  "FAILED_TO_APPLY",
  "payroll_adjustment_apply_failed",
].forEach((token) => includes("payroll adjustment service", service, token));

[
  "BASIC_SALARY_CORRECTION",
  "SALARY_INCREMENT_CORRECTION",
  "ALLOWANCE_ADJUSTMENT",
  "BENEFIT_ADJUSTMENT",
  "DEDUCTION_ADJUSTMENT",
  "ABSENCE_DEDUCTION_CORRECTION",
  "UNPAID_LEAVE_DEDUCTION_CORRECTION",
  "OVERTIME_ADJUSTMENT",
  "SERVICE_CHARGE_ADJUSTMENT",
  "BONUS_ADJUSTMENT",
  "PENALTY_ADJUSTMENT",
  "PAYROLL_COMPONENT_ADJUSTMENT",
  "PAYSLIP_CORRECTION",
  "MANUAL_ADJUSTMENT",
  "GENERAL_PAYROLL_ADJUSTMENT",
].forEach((token) => includes("canonical payroll adjustment types", read("src/modules/payroll/payroll-adjustments.types.ts"), token));

const repository = read("src/modules/payroll/payroll-adjustments.repository.ts");
[
  "findEmployeeByUserId",
  "findDuplicatePendingAdjustment",
  "createAdjustment",
  "updateAdjustmentApprovalLink",
  "updateAdjustmentStatus",
  "createAppliedLedger",
  "findAppliedLedger",
  "listAdjustments",
].forEach((token) => includes("payroll adjustment repository", repository, token));

const validators = read("src/modules/payroll/payroll-adjustments.validators.ts");
[
  "api_key",
  "device_secret",
  "rejectSensitivePayload(nested",
].forEach((token) => includes("payroll adjustment sensitive payload validation", validators, token));

const routes = read("src/routes/payroll.routes.ts");
[
  "/adjustments",
  "/adjustments/:id/submit",
  "/adjustments/:id/approve",
  "/adjustments/:id/reject",
  "/adjustments/:id/cancel",
  "/adjustments/:id/apply",
  "/adjustments/:id/approval-timeline",
  "payroll.adjustments.createForOthers",
  "payroll.adjustments.review",
  "payroll.adjustments.finalApprove",
  "payroll.adjustments.apply",
].forEach((token) => includes("payroll adjustment routes", routes, token));

const permissions = read("seeds/permissions.seed.sql");
[
  "payroll.adjustments.view",
  "payroll.adjustments.create",
  "payroll.adjustments.createForOthers",
  "payroll.adjustments.submit",
  "payroll.adjustments.approve",
  "payroll.adjustments.reject",
  "payroll.adjustments.finalApprove",
  "payroll.adjustments.cancel",
  "payroll.adjustments.cancelAny",
  "payroll.adjustments.apply",
].forEach((token) => includes("permission seed", permissions, token));

const payrollApi = read("frontend/src/features/payroll/payroll.api.ts");
[
  "listAdjustments",
  "createAdjustment",
  "submitAdjustment",
  "approveAdjustment",
  "rejectAdjustment",
  "cancelAdjustment",
  "applyAdjustment",
  "adjustmentTimeline",
].forEach((token) => includes("frontend payroll API", payrollApi, token));

const payrollPage = read("frontend/src/features/payroll/PayrollPage.tsx");
[
  "PayrollAdjustmentDialog",
  "PayrollAdjustmentsTable",
  "PayrollAdjustmentDetailDrawer",
  "canCreateAdjustment",
  "canApproveAdjustment",
  "canRejectAdjustment",
  "canCancelAdjustment",
  "canApplyAdjustment",
].forEach((token) => includes("frontend payroll page", payrollPage, token));

const payrollDialog = read("frontend/src/features/payroll/PayrollAdjustmentDialog.tsx");
[
  "EmployeeCombobox",
  "payrollApi.createAdjustment",
  "payrollApi.submitAdjustment",
  "Payroll adjustment request submitted for approval.",
  "BASIC_SALARY_CORRECTION",
  "GENERAL_PAYROLL_ADJUSTMENT",
  "showAdvancedReferences",
  "Advanced payroll references",
  "canSelectEmployee ? (",
].forEach((token) => includes("frontend payroll adjustment dialog", payrollDialog, token));

const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
[
  "operation_type === \"PAYROLL_ADJUSTMENT\"",
  "payrollApi.approveAdjustment",
  "payrollApi.rejectAdjustment",
  "payrollApi.cancelAdjustment",
].forEach((token) => includes("frontend generic approvals payroll path", approvalsPage, token));

const testsPath = "tests/payroll-adjustment-approval-integration.test.ts";
assert(existsSync(resolve(root, testsPath)), "payroll adjustment approval integration tests are missing.");
const tests = existsSync(resolve(root, testsPath)) ? read(testsPath) : "";
[
  "creates a PAYROLL_ADJUSTMENT request",
  "blocks a normal employee from creating a payroll adjustment for another employee",
  "payroll.adjustments.createForOthers",
  "does not create duplicate approval requests on repeated submit",
  "module-bound permissions",
  "operation ownership EXECUTION",
  "manual review instead of pretending to apply",
  "rejects sensitive payroll adjustment payload keys",
  "requested_value_json: { api_key",
  "current_value_json: { api_key",
  "metadata: { api_key",
  "device_secret",
  "Safe payroll payload",
  "generic approval routes",
  "frontend create/submit",
  "accepts every canonical payroll adjustment type",
  "execution belongs to another department",
  "specific-user execution target",
  "min/max level and required role",
  "Super Admin fallback",
  "PAYROLL_ADJUSTMENT_APPROVED_NOT_APPLIED",
].forEach((token) => includes("payroll adjustment tests", tests, token));

assert(!/status:\s*"APPLIED"[\s\S]{0,300}createAppliedLedger/.test(service), "APPLIED must not be used for detached ledger-only application.");

const frontendSource = payrollPage + payrollDialog + approvalsPage;
assert(!/window\.alert\s*\(|\balert\s*\(/.test(frontendSource), "payroll adjustment frontend reintroduced browser alert().");
assert(!/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource), "payroll adjustment frontend reintroduced browser confirm().");

console.log("Payroll adjustment approval engine verification");
console.log(`- migration: ${migrationPath}`);
console.log("- checked module-bound approval safety, operation ownership execution, frontend action paths, and tests");

if (failures.length > 0) {
  console.error("Payroll adjustment approval engine verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Payroll adjustment approval engine verification passed.");
