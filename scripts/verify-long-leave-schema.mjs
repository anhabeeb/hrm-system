import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Long leave verification failed: ${message}`);
  process.exit(1);
};

const migration = `${read("migrations/0039_long_leave_foreign_employee_hardening.sql")}\n${read("migrations/0040_long_leave_settings_and_review_status.sql")}`;
const routes = read("src/routes/long-leave.routes.ts");
const service = read("src/modules/long-leave/long-leave.service.ts");
const calculator = read("src/modules/long-leave/long-leave-calculator.service.ts");
const repository = read("src/modules/long-leave/long-leave.repository.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const api = read("frontend/src/features/long-leave/long-leave.api.ts");
const page = read("frontend/src/features/long-leave/LongLeavePage.tsx");
const form = read("frontend/src/features/long-leave/LongLeaveForm.tsx");
const drawer = read("frontend/src/features/long-leave/LongLeaveDetailDrawer.tsx");
const table = read("frontend/src/features/long-leave/LongLeaveTable.tsx");
const settingsPanel = read("frontend/src/features/long-leave/LongLeaveSettingsPanel.tsx");
const tests = read("tests/long-leave.test.ts");

for (const token of [
  "ALTER TABLE long_leave_records ADD COLUMN approval_status",
  "ALTER TABLE long_leave_records ADD COLUMN payroll_status",
  "CREATE TABLE IF NOT EXISTS long_leave_payroll_impacts",
  "ALTER TABLE long_leave_settings ADD COLUMN default_salary_treatment",
  "ALTER TABLE long_leave_settings ADD COLUMN default_deduction_method",
  "ALTER TABLE long_leave_settings ADD COLUMN partial_pay_ratio",
  "UNIQUE(company_id, idempotency_key)",
  "idx_long_leave_payroll_impacts_company_leave_month",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

for (const route of [
  '"/:id/submit"',
  '"/:id/approve"',
  '"/:id/reject"',
  '"/:id/cancel"',
  '"/:id/extend"',
  '"/:id/return"',
  '"/:id/timeline"',
  '"/:id/payroll-preview"',
  '"/:id/payroll-apply"',
  '"/settings"',
  "patch(\"/settings\"",
]) {
  if (!routes.includes(route)) fail(`route missing ${route}`);
}

for (const permission of [
  "long_leave.view",
  "long_leave.create",
  "long_leave.edit",
  "long_leave.submit",
  "long_leave.approve",
  "long_leave.reject",
  "long_leave.cancel",
  "long_leave.extend",
  "long_leave.return",
  "long_leave.override",
  "long_leave.payroll_preview",
  "long_leave.payroll_apply",
  "long_leave.settings.manage",
  "long_leave.timeline.view",
]) {
  if (!permissions.includes(permission)) fail(`permission ${permission} is not seeded`);
  if (!routes.includes(permission) && !page.includes(permission)) fail(`permission ${permission} is not enforced or guarded`);
}
if (!roles.includes("long_leave")) fail("long_leave module permissions are not assigned to default admin/HR roles");

for (const token of [
  "assertEligibleForLongLeave",
  "LONG_LEAVE_NOT_FOREIGN_EMPLOYEE",
  "LONG_LEAVE_DURATION_TOO_SHORT",
  "LONG_LEAVE_OVERLAP_EXISTS",
  "LONG_LEAVE_CLOSED_PAYROLL_PERIOD",
  "LONG_LEAVE_BACKDATE_NOT_ALLOWED",
  "findOverlappingLongLeave",
  "findOverlappingNormalLeave",
  "previewPayrollImpact",
  "applyPayrollImpact",
  "idempotency_key",
  "markPayrollImpactApplied",
  "getTimeline",
  "employee_worked_during_long_leave",
  "updateSettings",
  "syncApprovalRequest",
  "assertApprovalWorkflowAllowsDirectAction",
  "findLongLeaveCoverageForDate",
]) {
  if (!service.includes(token) && !repository.includes(token)) fail(`long leave service/repository missing ${token}`);
}

if (!calculator.includes("calculateLongLeavePayrollPreview")) fail("payroll preview calculator is missing");
if (service.includes('payable_days_policy: "pay_only_worked_days"')) {
  fail("createLongLeave hardcodes payable_days_policy to pay_only_worked_days");
}
if (!service.includes("derivePayableDaysPolicy(settings, input.payable_days_policy)")) {
  fail("createLongLeave does not derive payable_days_policy from company settings");
}
if (!calculator.includes("resolvePayableDaysPolicy(settings, record.payable_days_policy)")) {
  fail("calculator does not resolve missing/null payable_days_policy through settings fallback");
}
if (calculator.includes("settings.pay_only_worked_days === 1 || settings.salary_rule === \"pay_only_worked_days\" || record.payable_days_policy")) {
  fail("calculator can force pay-only-worked-days from settings before respecting explicit record policy");
}
for (const token of [
  "deductionMethod === \"calendar_days\"",
  "deductionMethod === \"working_days\"",
  "deductionMethod === \"scheduled_roster_days\"",
  "deductionMethod === \"attendance_days\"",
  "salaryTreatment === \"paid\"",
  "salaryTreatment === \"partially_paid\"",
  "salaryTreatment === \"custom\"",
  "payOnlyWorkedDays",
  "pay_holidays_during_long_leave",
  "pay_weekly_off_days_during_long_leave",
]) {
  if (!calculator.includes(token)) fail(`payroll calculator does not enforce ${token}`);
}
const previewBody = service.slice(service.indexOf("export const previewPayrollImpact"), service.indexOf("export const applyPayrollImpact"));
if (previewBody.includes("upsertPayrollImpact") || previewBody.includes("markPayrollImpactApplied")) fail("payroll preview mutates impact data");
const applyBody = service.slice(service.indexOf("export const applyPayrollImpact"), service.indexOf("export const calculateSalaryImpact"));
if (!applyBody.includes("upsertPayrollImpact")) fail("payroll apply does not persist idempotent impact rows");
if (applyBody.includes("payroll_status: \"payroll_adjusted\"")) fail("payroll apply claims payroll_adjusted without proving a payroll adjustment was created");
if (!applyBody.includes("review_recorded")) fail("payroll apply does not clearly report review-only semantics");
for (const bodyToken of [
  "syncApprovalRequest(env, context, record, \"approved\"",
  "syncApprovalRequest(env, context, record, \"rejected\"",
  "syncApprovalRequest(env, context, record, \"cancelled\"",
]) {
  if (!service.includes(bodyToken)) fail(`generic approval sync missing ${bodyToken}`);
}
if (!service.includes("LONG_LEAVE_APPROVAL_REQUIRED")) fail("direct long leave approval is not constrained when generic workflow is pending");
if (!service.includes("long_leave_super_admin_override")) fail("Super Admin override audit is missing");

for (const token of [
  "payrollPreview",
  "payrollApply",
  "timeline",
  "submit",
  "cancel",
  "extend",
  "settings",
  "updateSettings",
]) {
  if (!api.includes(token)) fail(`frontend API missing ${token}`);
}
for (const token of [
  "Payroll preview",
  "long_leave.payroll_preview",
  "long_leave.payroll_apply",
  "long_leave.submit",
  "long_leave.cancel",
  "Long Leave Settings",
]) {
  if (!page.includes(token) && !drawer.includes(token) && !table.includes(token) && !settingsPanel.includes(token)) fail(`frontend long leave UI missing ${token}`);
}
for (const token of [
  "Save settings",
  "Default salary treatment",
  "Default deduction method",
  "Pay only worked days",
  "Require payroll review",
  "count_holidays_inside_leave",
  "require_salary_impact_preview",
  "deduct_full_salary_if_zero_worked_days",
  "allow_hr_override",
]) {
  if (!settingsPanel.includes(token)) fail(`frontend long leave settings panel missing ${token}`);
}
if (!form.includes("Foreign employees are eligible by default")) fail("long leave form missing local/foreign eligibility warning");
if (!drawer.includes("Preview is read-only")) fail("payroll preview panel is missing or not clearly read-only");

if (tests.includes("it.todo")) fail("Phase 9C-critical long leave tests still contain it.todo placeholders");
for (const token of [
  "foreign employee can create long leave",
  "createLongLeave uses pay_only_worked_days settings to set payable_days_policy",
  "createLongLeave uses settings.salary_rule to set payable_days_policy to monthly_deduction",
  "monthly_deduction company settings produce monthly-deduction preview for a real created record",
  "pay_only_worked_days company settings produce pay-only-worked-days preview for a real created record",
  "null payable_days_policy uses monthly_deduction settings fallback",
  "null payable_days_policy uses pay_only_worked_days settings fallback",
  "changing long-leave settings does not silently rewrite historical records",
  "long-leave settings UI exposes all backend-supported policy switches",
  "local employee blocked",
  "duration below threshold blocked",
  "payroll preview for multi-month long leave",
  "payroll preview does not mutate data",
  "payroll apply is idempotent",
  "payroll apply stores review rows without claiming payroll was adjusted",
  "calendar-day and pay-only-worked-days policies produce different results",
  "working-days deduction excludes weekends",
  "scheduled roster deduction uses roster days",
  "attendance-days deduction pays only actual attendance",
  "paid salary treatment produces zero deduction",
  "partially paid treatment applies partial-pay ratio",
  "custom salary treatment requires payroll review",
  "settings update is persisted and audited",
  "approval finalization syncs generic approval request",
  "approval without workflow completion is blocked unless override is present",
  "early return recalculates final month",
  "extension recalculates added month",
  "long-leave coverage lookup identifies approved coverage",
  "closed payroll period blocks apply",
  "punch during long leave creates warning",
]) {
  if (!tests.includes(token)) fail(`missing Phase 9C test: ${token}`);
}

console.log("Long leave schema verification passed.");
