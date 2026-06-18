import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const normalize = (file) => file.replace(/\\/g, "/");
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist", ".wrangler", ".repo-remote"].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
};

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};

for (const scriptName of [
  "typecheck",
  "build",
  "build:frontend",
  "test",
  "verify:setup-guide",
  "verify:settings-module-lifecycle",
  "verify:module-toggles",
  "verify:module-aware-approvals",
  "verify:module-aware-alerts",
  "verify:module-aware-surfaces",
  "verify:admin-utility-pages-completion",
  "verify:production-readiness",
  "verify:migrations-production-ready",
  "verify:permission-audit",
  "verify:dashboard-personalization",
  "verify:hr-reports-schema",
  "verify:payroll-reports-schema",
  "verify:imports-schema",
  "verify:export-print-schema",
  "verify:attendance-calendar",
  "verify:payroll-schema",
  "verify:payslip-schema",
  "verify:production-acceptance",
  "verify:leave-policy-rules",
  "verify:self-service-approval-chain",
]) {
  assert(Boolean(scripts[scriptName]), `package.json missing ${scriptName} script.`);
}

for (const staleFile of [
  "frontend/src/features/report-exports/ReportPrintPage.tsx",
  "frontend/src/features/backup-recovery/BackupRecoveryPlaceholderPage.tsx",
  "frontend/src/features/import-export/ImportExportPlaceholderPage.tsx",
]) {
  assert(!exists(staleFile), `${staleFile} must not exist in production acceptance build.`);
}

for (const requiredFile of [
  "scripts/verify-final-hrm-acceptance.mjs",
  "scripts/verify-leave-policy-rules.mjs",
  "scripts/verify-self-service-approval-chain.mjs",
  "scripts/verify-setup-guide.mjs",
  "scripts/verify-settings-module-lifecycle.mjs",
  "scripts/verify-module-toggles.mjs",
  "scripts/verify-module-aware-approvals.mjs",
  "scripts/verify-module-aware-alerts.mjs",
  "scripts/verify-module-aware-surfaces.mjs",
  "scripts/verify-admin-utility-pages-completion.mjs",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-permission-audit.mjs",
  "migrations/0086_setup_guide.sql",
  "src/modules/setup-guide/setup-guide.registry.ts",
  "src/modules/setup-guide/setup-guide.service.ts",
  "src/modules/setup-guide/setup-guide.controller.ts",
  "src/routes/setup-guide.routes.ts",
  "frontend/src/features/setup-guide/SetupWizardPage.tsx",
  "frontend/src/features/setup-guide/SetupGuideOverlay.tsx",
  "frontend/src/features/setup-guide/SetupGuideGate.tsx",
  "frontend/src/features/setup-guide/SetupIncompleteDashboardBanner.tsx",
  "tests/setup-guide.test.ts",
  "tests/leave-policy-rules.test.ts",
  "tests/self-service-approval-chain.test.ts",
  "migrations/0087_leave_type_policy_rules.sql",
  "migrations/0088_leave_policy_rules_component_and_document_status.sql",
  "src/modules/leave/leave-policy.service.ts",
  "frontend/src/features/leave/LeavePolicyRuleDialog.tsx",
  "frontend/src/features/self-service/SelfServiceApprovalChainDialog.tsx",
]) {
  assert(exists(requiredFile), `${requiredFile} is missing.`);
}

const moduleKeys = [
  "documents",
  "asset_tracking",
  "uniform_tracking",
  "leave_management",
  "long_leave_management",
  "roster",
  "contract_tracking",
  "attendance",
  "payroll",
];
const subFeatureKeys = [
  "attendance.manual_entry_enabled",
  "attendance.kiosk_enabled",
  "attendance.biometric_enabled",
  "attendance.corrections_enabled",
  "attendance.payroll_deductions_enabled",
  "payroll.salary_processing_enabled",
  "payroll.payslips_enabled",
  "payroll.advances_enabled",
  "payroll.salary_loans_enabled",
  "payroll.overtime_enabled",
  "payroll.benefits_enabled",
  "payroll.manual_deductions_enabled",
  "payroll.attendance_deductions_enabled",
  "payroll.long_leave_deductions_enabled",
  "payroll.approvals_enabled",
];

const featureSeed = exists("seeds/feature-settings.seed.sql") ? read("seeds/feature-settings.seed.sql") : "";
const companySeed = exists("seeds/company-settings.seed.sql") ? read("seeds/company-settings.seed.sql") : "";
const settingsConstants = exists("src/modules/settings/settings.constants.ts") ? read("src/modules/settings/settings.constants.ts") : "";
const moduleStatusOverview = exists("frontend/src/features/settings/ModuleStatusOverview.tsx") ? read("frontend/src/features/settings/ModuleStatusOverview.tsx") : "";
const moduleAvailabilityPanel = exists("frontend/src/features/settings/ModuleAvailabilityPanel.tsx") ? read("frontend/src/features/settings/ModuleAvailabilityPanel.tsx") : "";
const structuredSettings = exists("frontend/src/features/settings/structured-settings.ts") ? read("frontend/src/features/settings/structured-settings.ts") : "";

for (const key of moduleKeys) {
  assert(featureSeed.includes(key) || settingsConstants.includes(key) || moduleStatusOverview.includes(key) || moduleAvailabilityPanel.includes(key), `optional module key ${key} is missing from settings/seed surfaces.`);
}
assert(
  (exists("frontend/src/config/moduleCodes.ts") && read("frontend/src/config/moduleCodes.ts").includes("document_tracking")) ||
    (exists("src/config/module-codes.ts") && read("src/config/module-codes.ts").includes("document_tracking")),
  "Document Tracking alias document_tracking is missing from module code aliases.",
);
for (const key of subFeatureKeys) {
  assert(companySeed.includes(key) || structuredSettings.includes(key) || settingsConstants.includes(key), `sub-feature key ${key} is missing from settings/seed surfaces.`);
}

const setupRegistry = exists("src/modules/setup-guide/setup-guide.registry.ts") ? read("src/modules/setup-guide/setup-guide.registry.ts") : "";
for (const marker of [
  "feature_modules",
  "disabled_by_choice",
  "needs_setup_after_enable",
  "review_recommended",
  "target_highlight_key",
  "module-status-overview",
]) {
  assert(setupRegistry.includes(marker) || (exists("src/modules/setup-guide/setup-guide.types.ts") && read("src/modules/setup-guide/setup-guide.types.ts").includes(marker)), `setup guide missing marker ${marker}.`);
}

const setupService = exists("src/modules/setup-guide/setup-guide.service.ts") ? read("src/modules/setup-guide/setup-guide.service.ts") : "";
assert(setupService.includes("settingsService.updateFeature"), "setup guide module-choice must update real feature settings through settings service.");
assert(setupService.includes("audit") || setupService.includes("auditLog"), "setup guide service must audit setup actions.");

const leavePolicyService = exists("src/modules/leave/leave-policy.service.ts") ? read("src/modules/leave/leave-policy.service.ts") : "";
const leavePolicyTests = exists("tests/leave-policy-rules.test.ts") ? read("tests/leave-policy-rules.test.ts") : "";
assert(leavePolicyService.includes("requestedDays > consecutiveThreshold"), "leave policy consecutive-day document threshold must use exceeds (>) behavior.");
for (const marker of [
  "applies FRL document threshold",
  "1 day",
  "2 days",
  "3 consecutive days",
  "applies Sick Leave document thresholds",
  "exactly 15 total used days",
  "more than 15 total used days",
  "selected allowance",
  "pending document",
  "LEAVE_DOCUMENT_REQUIRED",
]) {
  assert(leavePolicyTests.includes(marker), `leave policy tests missing marker ${marker}.`);
}

const selfServiceRoutes = exists("src/routes/self-service.routes.ts") ? read("src/routes/self-service.routes.ts") : "";
const selfServiceService = exists("src/modules/self-service/self-service.service.ts") ? read("src/modules/self-service/self-service.service.ts") : "";
const selfServiceRepository = exists("src/modules/self-service/self-service.repository.ts") ? read("src/modules/self-service/self-service.repository.ts") : "";
const selfServiceTests = exists("tests/self-service-approval-chain.test.ts") ? read("tests/self-service-approval-chain.test.ts") : "";
assert(selfServiceRoutes.includes('/requests/:requestId/approval-chain'), "self-service approval chain endpoint is missing.");
assert(selfServiceRoutes.includes('requireFeature("leave_management")'), "self-service approval chain endpoint must respect Leave Management module state.");
assert(selfServiceService.includes("SHOW_APPROVER_NAMES_TO_EMPLOYEES = false"), "self-service approval chain must hide approver names by default.");
assert(selfServiceService.includes("FINANCE_FINAL_APPROVER"), "self-service approval chain must label configured Finance workflow steps.");
assert(!/Finance[^;\n]+push|push\([^)]*Finance|step_label:\s*["']Finance/.test(selfServiceService), "self-service approval chain must not synthesize a Finance step.");
for (const marker of ["requester_user_id = ?", "requester_employee_id = ?", "subject_employee_id = ?", "employee_id = ?", "approval_request_steps"]) {
  assert(selfServiceRepository.includes(marker), `self-service approval chain repository missing ownership/step marker ${marker}.`);
}
for (const marker of [
  "Finance does not appear when not configured",
  "Finance appears when configured",
  "Approver names are hidden",
  "Leave policy document-required status",
]) {
  assert(selfServiceTests.includes(marker), `self-service approval chain tests missing marker ${marker}.`);
}

const setupRoutes = exists("src/routes/setup-guide.routes.ts") ? read("src/routes/setup-guide.routes.ts") : "";
for (const routeMarker of [
  'get("/status"',
  'get("/activities"',
  'post("/activities/:activityKey/start"',
  'post("/activities/:activityKey/complete"',
  'post("/activities/:activityKey/skip"',
  'post("/activities/:activityKey/resume"',
  'post("/finish"',
  'post("/skip-for-now"',
  'post("/recalculate"',
  'post("/module-choice"',
]) {
  assert(setupRoutes.includes(routeMarker), `setup-guide routes missing ${routeMarker}.`);
}

const router = exists("frontend/src/app/router.tsx") ? read("frontend/src/app/router.tsx") : "";
assert(router.includes('path="/setup-wizard"'), "frontend router missing /setup-wizard route.");
assert(!router.includes("ReportPrintPage"), "frontend router must not reference ReportPrintPage.");
assert(!router.includes("/reports/print"), "frontend router must not expose normal report print route.");

const reportTypes = exists("src/modules/report-exports/report-exports.types.ts") ? read("src/modules/report-exports/report-exports.types.ts") : "";
const reportValidators = exists("src/modules/report-exports/report-exports.validators.ts") ? read("src/modules/report-exports/report-exports.validators.ts") : "";
const reportService = exists("src/modules/report-exports/report-exports.service.ts") ? read("src/modules/report-exports/report-exports.service.ts") : "";
const reportActions = exists("frontend/src/features/report-exports/ReportExportActions.tsx") ? read("frontend/src/features/report-exports/ReportExportActions.tsx") : "";
assert(reportTypes.includes('"xlsx" | "pdf"'), "report export type must be xlsx/pdf only.");
assert(reportValidators.includes('z.enum(["xlsx", "pdf"])'), "report export validator must allow xlsx/pdf only.");
assert(reportService.includes("Only Excel and PDF report exports are supported."), "report export service must reject unsupported formats.");
assert(reportService.includes("generateExcelWorkbook") && reportService.includes("generatePdfReport"), "report export service must generate Excel and PDF outputs.");
assert(reportActions.includes('exportReport("xlsx")') && reportActions.includes('exportReport("pdf")'), "report export UI must expose Excel and PDF actions.");
assert(!reportActions.includes("CSV") && !reportActions.includes("Print"), "report export UI must not expose CSV or Print actions.");

const notificationClassifier = exists("src/modules/notifications/module-aware-alerts.ts") ? read("src/modules/notifications/module-aware-alerts.ts") : "";
const attendanceDeductionIndex = notificationClassifier.indexOf("attendance_deduction");
const longLeaveDeductionIndex = notificationClassifier.indexOf("long_leave_deduction");
const manualDeductionIndex = notificationClassifier.indexOf("manual_deduction");
assert(attendanceDeductionIndex >= 0 && manualDeductionIndex >= 0 && attendanceDeductionIndex < manualDeductionIndex, "attendance deduction alert classification must run before manual deduction.");
assert(longLeaveDeductionIndex >= 0 && manualDeductionIndex >= 0 && longLeaveDeductionIndex < manualDeductionIndex, "long leave deduction alert classification must run before manual deduction.");

const productionSourceRoots = ["src", "frontend/src", "migrations", "seeds"];
const allSourceFiles = productionSourceRoots
  .flatMap((dir) => listFiles(path.join(root, dir)))
  .map((file) => normalize(path.relative(root, file)))
  .filter((file) => /\.(ts|tsx|js|mjs|sql|md|json)$/.test(file))
  .filter((file) => !file.startsWith("frontend/dist/"));
const allSourceText = allSourceFiles.map((file) => `${file}\n${read(file)}`).join("\n");

for (const banned of [
  "ReportPrintPage",
  "reportExportsApi.printData",
  "reportExportsApi.employeePrintData",
  "/reports/print",
  "Generate JSON report",
  "CSV/PDF/XLSX export formatting is future work",
  "IMPORT_APPLY_NOT_CONFIGURED",
  "IMPLEMENT_LATER",
]) {
  assert(!allSourceText.includes(banned), `stale production marker still present: ${banned}`);
}

for (const stalePath of [
  "frontend/src/features/backup-recovery/BackupRecoveryPlaceholderPage.tsx",
  "frontend/src/features/import-export/ImportExportPlaceholderPage.tsx",
  "frontend/src/features/report-exports/ReportPrintPage.tsx",
]) {
  assert(!allSourceFiles.includes(stalePath), `stale file still present in source list: ${stalePath}`);
}

if (failures.length > 0) {
  console.error("Final HRM acceptance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Final HRM acceptance verification passed.");
}
