import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => {
  const full = resolve(root, file);
  if (!existsSync(full)) {
    failures.push(`Missing ${file}`);
    return "";
  }
  return readFileSync(full, "utf8");
};
const ensure = (condition, message) => {
  if (!condition) failures.push(message);
};
const includesAll = (label, file, markers) => {
  const text = read(file);
  for (const marker of markers) ensure(text.includes(marker), `${label}: missing ${marker}`);
  return text;
};

const dashboardWidgets = includesAll("dashboard widget registry", "frontend/src/config/dashboardWidgets.ts", [
  "requiredPayrollSubFeature",
  "requiredPayrollSubFeaturesAll",
  "requiredAttendanceSubFeature",
  "requiredAttendanceSubFeaturesAll",
  'requiredPayrollSubFeature: "payslips_enabled"',
]);
ensure(!/my-payslips[\s\S]{0,220}requiredFeature:\s*"payroll"[\s\S]{0,220}defaultVisible:\s*true(?![\s\S]{0,220}requiredPayrollSubFeature)/.test(dashboardWidgets), "Self-service payslip widget must not rely on broad Payroll module visibility only.");

includesAll("dashboard personalization filtering", "frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts", [
  "hasPayrollSubFeature",
  "hasAllPayrollSubFeatures",
  "hasAttendanceSubFeature",
  "hasAllAttendanceSubFeatures",
  "requiredPayrollSubFeature",
  "requiredAttendanceSubFeature",
]);

includesAll("navigation access helper", "frontend/src/lib/navigationAccess.ts", [
  "hasPayrollSubFeature",
  "hasAllPayrollSubFeatures",
  "hasAttendanceSubFeature",
  "hasAllAttendanceSubFeatures",
  "requiredPayrollSubFeature",
  "requiredAttendanceSubFeature",
]);

const dashboardService = includesAll("command center dashboard service", "src/modules/dashboard/dashboard.service.ts", [
  "attendanceCorrectionsEnabled",
  "attendancePayrollDeductionsEnabled",
  "payrollSalaryProcessingEnabled",
  "payrollPayslipsEnabled",
  "payrollAdvancesEnabled",
  'quick_actions: quickActions',
  'widget("Payroll Readiness", payrollEnabled && payrollSalaryProcessingEnabled',
  "attendanceCorrectionsEnabled ? { pending_corrections: n(pendingCorrections?.total) } : {}",
  "payrollPayslipsEnabled ? data.payroll_readiness?.payslip_generation_status",
]);
ensure(!dashboardService.includes('countApprovalRow("attendance-correction", "Attendance correction approvals", approvalCount("ATTENDANCE_CORRECTION"), "/attendance/corrections", attendanceEnabled, canViewApprovals)'), "Command center attendance correction approvals must require attendance corrections sub-feature.");
ensure(!dashboardService.includes('widget("Payroll Readiness", payrollEnabled, canViewPayroll'), "Payroll Readiness widget must require salary processing sub-feature.");

includesAll("HR reports frontend", "frontend/src/features/hr-reports/HrReportsPage.tsx", [
  "reportAvailable",
  "documentTrackingEnabled",
  "assetTrackingEnabled",
  "uniformTrackingEnabled",
  "assetTrackingEnabled || uniformTrackingEnabled",
  "attendanceSubFeatures.correctionsEnabled",
  "attendanceSubFeatures.kioskEnabled",
  "attendanceSubFeatures.biometricEnabled",
  "visibleCategories",
  "filter(reportAvailable)",
]);
ensure(!read("frontend/src/features/hr-reports/HrReportsPage.tsx").includes('auth.hasFeature("asset_tracking") && auth.hasFeature("uniform_tracking")'), "HR Reports frontend must not require both Asset Tracking and Uniform Tracking for all asset/uniform reporting.");

const hrReportRoutes = includesAll("HR reports route", "src/routes/hr-reports.routes.ts", [
  "requireAnyFeature",
  'requireAnyFeature(["asset_tracking", "uniform_tracking"]',
  "ASSETS_UNIFORMS_REPORT_DISABLED",
  "Asset Tracking or Uniform Tracking must be enabled before viewing this report.",
  "requireAssetsOrUniformsFeature",
  'hrReportsRoutes.get("/assets-uniforms", requireAssetsOrUniformsFeature',
  "await requireAssetsOrUniformsFeature(c, async () => undefined)",
]);
ensure(
  !hrReportRoutes.includes('hrReportsRoutes.get("/assets-uniforms", requireFeature("asset_tracking"), requireFeature("uniform_tracking")'),
  "HR Reports assets/uniforms direct route must use an either-module guard, not sequential asset and uniform requireFeature calls.",
);
ensure(
  !/key === "assets-uniforms"[\s\S]{0,180}requireFeature\("asset_tracking"\)[\s\S]{0,180}requireFeature\("uniform_tracking"\)/.test(hrReportRoutes),
  "HR Reports dynamic assets/uniforms route must use an either-module guard, not sequential asset and uniform requireFeature calls.",
);

includesAll("Payroll reports frontend", "frontend/src/features/payroll-reports/PayrollReportsPage.tsx", [
  "payrollReportAvailable",
  "payrollSubFeatures.salaryProcessingEnabled",
  "payrollSubFeatures.manualDeductionsEnabled",
  "payrollSubFeatures.attendanceDeductionsEnabled",
  "attendanceSubFeatures.payrollDeductionsEnabled",
  "filter(payrollReportAvailable)",
]);

includesAll("Import/Export frontend", "frontend/src/features/import-export/ImportExportPage.tsx", [
  "visibleExportTypes",
  "documentTrackingEnabled",
  "payrollSubFeatures.salaryProcessingEnabled",
  "documents_metadata",
]);

includesAll("Employee 360 frontend", "frontend/src/features/employees/Employee360Page.tsx", [
  "canViewDocuments",
  "canViewPayroll",
  "payrollSubFeatures.salaryProcessingEnabled",
  "TabsTrigger value=\"documents\"",
  "TabsTrigger value=\"payroll\"",
]);

includesAll("Employee 360 backend", "src/modules/employees/employees.service.ts", [
  "DOCUMENT_TRACKING_DISABLED",
  "CONTRACT_TRACKING_DISABLED",
  "PAYROLL_SALARY_PROCESSING_DISABLED",
  "documentsEnabled",
  "salaryProcessingEnabled",
]);

const selfServiceBackend = includesAll("Self-service backend", "src/modules/self-service/self-service.service.ts", [
  "resolveSelfServiceCapabilities",
  "payroll.payslips_enabled",
  "isPayrollSubFeatureEnabled",
  "attendance.corrections_enabled",
  "attendanceCorrectionsSubFeatureEnabled",
  "canRequestAttendanceCorrection",
  "capabilities.payslipsEnabled",
  "canViewAttendanceCorrections",
]);
ensure(!selfServiceBackend.includes('const payslipsEnabled = feature(featureSet, "payslips") || feature(featureSet, "payroll")'), "Self-service backend must not treat broad Payroll module as enough for payslips.");
ensure(!selfServiceBackend.includes('quickAction("attendance-correction", "Request attendance correction", "/self/attendance", canViewAttendance'), "Self-service attendance correction action must require attendance.corrections_enabled.");

includesAll("HR reports backend", "src/modules/hr-reports/hr-reports.service.ts", [
  "documentsEnabled",
  "attendanceEnabled",
  "asset_tracking",
  "uniform_tracking",
  "assetsEnabled || uniformsEnabled",
  "DOCUMENT_TRACKING_DISABLED",
  "definition.category !== \"documents\"",
  "definition.category !== \"attendance\"",
]);
ensure(!read("src/modules/hr-reports/hr-reports.service.ts").includes("assets: assetsEnabled && uniformsEnabled"), "HR Reports backend must support independent Asset/Uniform module visibility.");
includesAll("HR reports repository", "src/modules/hr-reports/hr-reports.repository.ts", [
  "includeAssets",
  "includeUniforms",
  'FROM asset_assignments',
  'FROM uniform_issues',
]);

includesAll("Payroll reports backend", "src/modules/payroll-reports/payroll-reports.service.ts", [
  "salary_processing",
  "manual_deductions",
  "PAYROLL_SALARY_PROCESSING_DISABLED",
  "PAYROLL_MANUAL_DEDUCTIONS_DISABLED",
  "payroll.salary_processing_enabled",
  "payroll.manual_deductions_enabled",
]);

includesAll("Import/Export backend", "src/modules/import-export/export-job.service.ts", [
  'documents_metadata: "documents"',
  "DOCUMENT_TRACKING_DISABLED",
  "PAYROLL_SALARY_PROCESSING_DISABLED",
  "payroll.salary_processing_enabled",
]);

includesAll("Report exports backend", "src/modules/report-exports/report-exports.service.ts", [
  "moduleEnabledForCatalogItem",
  "assertCatalogItemEnabled",
  "REPORT_EXPORT_MODULE_DISABLED",
  "payroll:deductions",
  "hr:document-compliance",
  "hr:assets-uniforms",
  "assetsEnabled || uniformsEnabled",
  "PAYROLL_SALARY_PROCESSING_DISABLED",
  "PAYROLL_MANUAL_DEDUCTIONS_DISABLED",
]);
ensure(!read("src/modules/report-exports/report-exports.service.ts").includes("return assetsEnabled && uniformsEnabled;"), "Report exports must support independent Asset/Uniform module visibility.");

const selfServiceTests = includesAll("Self-service dashboard tests", "tests/employee-self-service-dashboard.test.ts", [
  "payslips sub-feature disabled",
  "corrections disabled",
  "getLatestPayslip).not.toHaveBeenCalled",
  "getAttendanceCorrectionCounts).not.toHaveBeenCalled",
]);
const hrReportTests = includesAll("HR reports tests", "tests/hr-reports.test.ts", [
  "asset tracking enabled without uniforms",
  "uniform tracking enabled without assets",
  "both modules are disabled",
]);
const exportTests = includesAll("Report export tests", "tests/export-print.test.ts", [
  "only Asset Tracking is enabled",
  "only Uniform Tracking is enabled",
  "both modules are disabled",
]);

if (failures.length) {
  console.error("Module-aware surfaces verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Module-aware surfaces verification passed.");
