import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const mustExist = (file) => {
  if (!exists(file)) failures.push(`${file} is missing.`);
};

const mustContain = (file, markers) => {
  const text = read(file);
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${file} is missing marker: ${marker}`);
  }
};

mustExist("src/modules/approvals/approval-module-access.service.ts");
mustContain("src/modules/approvals/approval-module-access.service.ts", [
  "APPROVAL_OPERATION_MODULE_REQUIREMENTS",
  "LEAVE_REQUEST",
  "leave_management",
  "ATTENDANCE_CORRECTION",
  "attendance.corrections_enabled",
  "ROSTER_CHANGE",
  "roster",
  "PAYROLL_ADJUSTMENT",
  "manual_deductions_enabled",
  "approvals_enabled",
  "PAYROLL_APPROVAL",
  "ADVANCE_SALARY_REQUEST",
  "advances_enabled",
  "SALARY_LOAN_REQUEST",
  "salary_loans_enabled",
  "LONG_LEAVE_REQUEST",
  "long_leave_management",
  "DOCUMENT_KYC_UPDATE",
  "document_tracking",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "employee_structure_changes",
  "RESIGNATION",
  "resignation_offboarding",
  "DISCIPLINARY_ACTION",
  "disciplinary_actions",
  "CONTRACT_RENEWAL",
  "contract_tracking",
  "ASSET_ISSUE",
  "asset_tracking",
  "UNIFORM_ISSUE",
  "uniform_tracking",
  "assertApprovalOperationModuleEnabled",
  "getEnabledApprovalOperationTypes",
  "annotateApprovalModuleState",
  "resolveApprovalOperationTypeForLegacyApproval",
]);

mustContain("src/modules/approvals/approval-workflow-engine.service.ts", [
  "assertApprovalOperationModuleEnabled(env, context, input.operation_type)",
  "assertApprovalOperationModuleEnabled(env, context, request.operation_type)",
  "activeModuleFilter",
  "getEnabledApprovalOperationTypes(env, context, APPROVAL_OPERATION_TYPES)",
  "annotateApprovalModuleState(env, context, rows)",
]);

mustContain("src/modules/approvals/approvals.service.ts", [
  "legacyApprovalOperationType",
  "legacyModuleState",
  "assertLegacyApprovalModuleEnabled",
  "!moduleState.enabled && isActiveApprovalStatus(effectiveRow.status)",
  "module_enabled: moduleState.enabled",
  "read_only: !moduleState.enabled && isActiveApprovalStatus(request.status)",
  "assertApprovalOperationModuleEnabled(env, context, resolveApprovalOperationTypeForLegacyApproval",
]);

mustContain("src/modules/dashboard/dashboard.service.ts", [
  "getEnabledApprovalOperationTypes",
  "enabledApprovalOperationTypes",
  "repository.approvalQueueCounts(env, actor, enabledApprovalOperationTypes)",
]);

mustContain("src/modules/navigation/navigation.service.ts", [
  "getEnabledApprovalOperationTypes",
  "APPROVAL_OPERATION_TYPES",
  "r.operation_type IN",
  "enabledOperationTypes",
]);

mustContain("src/modules/self-service/self-service.service.ts", [
  "getEnabledApprovalOperationTypes",
  "enabledApprovalOperationTypes",
  "listSelfPendingApprovals",
]);

mustContain("src/modules/self-service/self-service.repository.ts", [
  "operationTypes",
  "r.operation_type IN",
  "AND 1 = 0",
]);

mustContain("frontend/src/features/approvals/ApprovalsPage.tsx", [
  "operationModuleEnabled",
  "hasAttendanceSubFeature(user, \"corrections_enabled\")",
  "hasPayrollSubFeature(user, \"approvals_enabled\")",
  "hasPayrollSubFeature(user, \"manual_deductions_enabled\")",
  "hasPayrollSubFeature(user, \"advances_enabled\")",
]);

mustContain("frontend/src/features/approvals/ApprovalEngineRequestsTable.tsx", [
  "Module disabled",
  "Read-only while module is disabled",
  "canAct(row)",
]);

mustContain("tests/approval-workflow-engine.test.ts", [
  "blocks approval request creation when the related module or sub-feature is disabled",
  "filters active approval queues to enabled modules and preserves own historical requests",
  "blocks approval actions for disabled module records without deleting history",
]);

mustContain("tests/approvals.test.ts", [
  "keeps legacy approval queues and actions module-aware",
  "resolveApprovalOperationTypeForLegacyApproval",
  "assertLegacyApprovalModuleEnabled",
]);

if (failures.length > 0) {
  console.error("Module-aware approvals verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Module-aware approvals verification passed.");
