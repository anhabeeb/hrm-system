import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const fail = (message) => {
  console.error(`Leave policy rules verification failed: ${message}`);
  process.exit(1);
};
const assertFile = (file) => {
  if (!existsSync(resolve(root, file))) fail(`${file} is missing.`);
  return read(file);
};
const assertIncludes = (content, marker, message) => {
  if (!content.includes(marker)) fail(message);
};
const assertNotIncludes = (content, marker, message) => {
  if (content.includes(marker)) fail(message);
};

const migration = assertFile("migrations/0087_leave_type_policy_rules.sql");
for (const marker of [
  "CREATE TABLE IF NOT EXISTS leave_type_policy_rules",
  "leave_type_key",
  "annual_entitlement_days",
  "paid_status",
  "payroll_impact_enabled",
  "document_requirement",
  "document_required_mode",
  "document_after_days",
  "document_required_after_consecutive_days",
  "document_after_used_days",
  "document_required_after_used_days",
  "allow_no_document_until_used_days",
  "require_document_for_backdated_request",
  "require_document_for_extension",
  "salary_deduction_enabled",
  "deduction_component_keys_json",
  "deduction_pay_component_keys",
  "deduction_daily_rate_method",
  "deduction_custom_divisor",
  "payroll_source_label",
  "approval_workflow_key",
  "allow_half_day",
  "allow_carry_forward",
  "carry_forward_limit_days",
  "reset_period",
  "count_weekends",
  "count_public_holidays",
  "created_by",
  "updated_by",
  "INSERT OR IGNORE INTO leave_type_policy_rules",
  "family_responsibility_leave",
  "family_responsibility_leave_policy",
]) {
  assertIncludes(migration, marker, `migration is missing ${marker}.`);
}
if (/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+leave_types/i.test(migration)) {
  fail("migration contains destructive or module-disabling SQL.");
}

const routes = assertFile("src/routes/leave.routes.ts");
assertIncludes(routes, '"/policy-rules"', "leave policy rules route is missing.");
assertIncludes(routes, '"/policy-rules/:id/reset-default"', "leave policy reset-to-default route is missing.");
assertIncludes(routes, '"/policy-preview"', "leave policy preview route is missing.");
assertIncludes(routes, 'requireFeature("leave_management")', "leave routes must remain module guarded.");

const service = assertFile("src/modules/leave/leave-policy.service.ts");
for (const marker of [
  "evaluateLeavePolicy",
  "defaultPolicyRuleForLeaveType",
  "isFamilyResponsibilityLeave",
  "after_consecutive_or_used_days",
  "sumApprovedLeaveDaysForYear",
  "salary_deduction_required",
  "document_required",
  "exceeds",
  "require_document_for_backdated_request",
  "require_document_for_extension",
  "deduction_source_label",
]) {
  assertIncludes(service, marker, `leave policy service is missing ${marker}.`);
}
if (/requestedDays\s*>=\s*consecutiveThreshold/.test(service) || /requestedDays\s*>=\s*Number\(rule\.document_after_days/.test(service)) {
  fail("consecutive-day document logic still appears to use reaches-threshold (>=) behavior.");
}
assertIncludes(service, "requestedDays > consecutiveThreshold", "consecutive-day document logic must require requests to exceed the threshold.");
assertIncludes(service, "usedDaysInYear + requestedDays > usedThreshold", "used-day document logic must use exceeds-threshold behavior.");

const leaveService = assertFile("src/modules/leave/leave.service.ts");
assertIncludes(leaveService, "previewLeavePolicy", "leave service preview function is missing.");
assertIncludes(leaveService, "updateLeaveTypePolicyRule", "leave service policy rule update is missing.");
assertIncludes(leaveService, "policyPreview.salary_deduction_required", "leave request create/update does not apply policy payroll impact.");
assertIncludes(leaveService, "pending_document", "document-required requests are not held as pending document.");
assertIncludes(leaveService, "LEAVE_DOCUMENT_REQUIRED", "document-required submission is still warning-only.");
assertIncludes(leaveService, "Supporting document is required for this leave request", "document-required submission message is missing.");
assertIncludes(leaveService, "leave_policy_rule_updated", "policy rule update audit marker is missing.");
assertIncludes(leaveService, "leave_policy_rule_reset_to_default", "policy rule reset audit marker is missing.");
assertIncludes(leaveService, "updated_by: context.actorUserId", "policy rule updates must record the updater.");
assertIncludes(leaveService, "document_required_mode", "policy rule update must synchronize document rule aliases.");
assertIncludes(leaveService, "deduction_pay_component_keys", "policy rule update must synchronize component key aliases.");

const payrollRepo = assertFile("src/modules/payroll/payroll.repository.ts");
assertIncludes(payrollRepo, "leave_type_policy_rules", "payroll approved leave query does not join policy rules.");
assertIncludes(payrollRepo, "policy_deduction_component_keys_json", "payroll approved leave query does not expose selected component keys.");
assertIncludes(payrollRepo, "policy_deduction_pay_component_keys", "payroll approved leave query does not expose prompt component key alias.");
assertIncludes(payrollRepo, "policy_deduction_daily_rate_method", "payroll approved leave query does not expose daily rate method.");

const payrollCalc = assertFile("src/modules/payroll/payroll.calculator.ts");
for (const marker of [
  'source_type: "leave_policy"',
  "leave_policy_deduction",
  "deduction_rule_id",
  "deductible_days",
  "policy_paid_percentage",
  "selected_allowance",
  "selected_pay_components",
  "findPolicyComponents",
  "component_amount_used",
  "policy_deduction_pay_component_keys",
  "policy_deduction_daily_rate_method",
  "policy_deduction_custom_divisor",
]) {
  assertIncludes(payrollCalc, marker, `payroll calculator is missing ${marker}.`);
}
if (/dailySalary\s*\*\s*dates\.length\s*\*\s*\(deductionPercent\s*\/\s*100\)/.test(payrollCalc)) {
  fail("leave policy payroll deduction still appears to use only basic daily salary.");
}

const hrReports = assertFile("src/modules/hr-reports/hr-reports.repository.ts");
for (const marker of ["document_required", "document_submitted", "deductible", "deduction_source", "policy_rule_used"]) {
  assertIncludes(hrReports, marker, `HR leave reports are missing ${marker}.`);
}

const leaveApi = assertFile("frontend/src/features/leave/leave.api.ts");
assertIncludes(leaveApi, "previewPolicy", "frontend leave policy preview API is missing.");
assertIncludes(leaveApi, "listPolicyRules", "frontend policy rules API is missing.");
assertIncludes(leaveApi, "updatePolicyRule", "frontend policy rule update API is missing.");
assertIncludes(leaveApi, "resetPolicyRule", "frontend policy rule reset API is missing.");

const leavePage = assertFile("frontend/src/features/leave/LeavePage.tsx");
const leaveForm = assertFile("frontend/src/features/leave/LeaveRequestForm.tsx");
const leavePanel = assertFile("frontend/src/features/leave/LeaveTypesPanel.tsx");
const leaveDialog = assertFile("frontend/src/features/leave/LeavePolicyRuleDialog.tsx");
const frontend = `${leavePage}\n${leaveForm}\n${leavePanel}\n${leaveDialog}`;
for (const marker of [
  "Leave policy preview",
  "Leave policy rules",
  "salary_deduction_enabled",
  "Deduction mode",
  "Selected pay component keys",
  "Daily rate method",
  "Carry forward / reset",
  "Summary preview",
  "Document rule summary",
  "Reset to default",
  'data-setup-target="leave-policy-rules"',
  'data-setup-target="leave-document-rules"',
  'data-setup-target="leave-deduction-rules"',
]) {
  assertIncludes(frontend, marker, `frontend leave policy UI is missing ${marker}.`);
}
assertNotIncludes(frontend, "Reset to default (not configured)", "leave policy reset remains a disabled placeholder.");
if (/alert\s*\(|confirm\s*\(|dark:/i.test(frontend)) {
  fail("leave policy UI introduced alert/confirm or dark-mode markers.");
}

const setupRegistry = assertFile("src/modules/setup-guide/setup-guide.registry.ts");
for (const marker of ["leave_policy_rules", "leave-document-rules", "leave-deduction-rules"]) {
  assertIncludes(setupRegistry, marker, `setup guide registry is missing ${marker}.`);
}

const settings = assertFile("frontend/src/features/settings/structured-settings.ts");
for (const marker of ["leave-policy-rules", "leave-document-rules", "leave-deduction-rules"]) {
  assertIncludes(settings, marker, `structured settings setup target ${marker} is missing.`);
}

const tests = assertFile("tests/leave-policy-rules.test.ts");
for (const marker of [
  "FRL",
  "1 day",
  "2 days",
  "3 consecutive days",
  "Sick Leave",
  "exactly 15 total used days",
  "more than 15 total used days",
  "selected allowance",
  "pending_document",
  "LEAVE_DOCUMENT_REQUIRED",
  "document_required",
  "salary_deduction_required",
  "leave_policy_deduction",
]) {
  assertIncludes(tests, marker, `leave policy tests are missing ${marker}.`);
}

console.log("Leave policy rules verification passed.");
