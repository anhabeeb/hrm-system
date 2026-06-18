import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const mustInclude = (label, file, markers) => {
  const text = read(file);
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${label}: missing ${marker}`);
  }
  return text;
};

if (!exists("migrations/0080_asset_uniform_tracking_feature_settings.sql")) {
  failures.push("migration: 0080_asset_uniform_tracking_feature_settings.sql is missing.");
}
if (!exists("migrations/0081_leave_long_leave_management_feature_settings.sql")) {
  failures.push("migration: 0081_leave_long_leave_management_feature_settings.sql is missing.");
}
if (!exists("migrations/0082_duty_roster_feature_metadata.sql")) {
  failures.push("migration: 0082_duty_roster_feature_metadata.sql is missing.");
}
if (!exists("migrations/0083_contract_tracking_feature_setting.sql")) {
  failures.push("migration: 0083_contract_tracking_feature_setting.sql is missing.");
}
if (!exists("migrations/0084_attendance_management_feature_settings.sql")) {
  failures.push("migration: 0084_attendance_management_feature_settings.sql is missing.");
}
if (!exists("migrations/0085_payroll_management_feature_settings.sql")) {
  failures.push("migration: 0085_payroll_management_feature_settings.sql is missing.");
}

const migration = exists("migrations/0080_asset_uniform_tracking_feature_settings.sql")
  ? read("migrations/0080_asset_uniform_tracking_feature_settings.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "asset_tracking", "uniform_tracking", "WHERE c.deleted_at IS NULL"]) {
  if (!migration.includes(marker)) failures.push(`migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM|UPDATE\s+feature_settings/i.test(migration)) {
  failures.push("migration: module toggle migration must remain additive and must not drop/delete/update existing data.");
}
const leaveMigration = exists("migrations/0081_leave_long_leave_management_feature_settings.sql")
  ? read("migrations/0081_leave_long_leave_management_feature_settings.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "leave_management", "long_leave_management", "WHERE c.deleted_at IS NULL"]) {
  if (!leaveMigration.includes(marker)) failures.push(`leave migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM|UPDATE\s+feature_settings/i.test(leaveMigration)) {
  failures.push("leave migration: must remain additive and must not drop/delete/update existing data.");
}
const rosterMigration = exists("migrations/0082_duty_roster_feature_metadata.sql")
  ? read("migrations/0082_duty_roster_feature_metadata.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "feature_key = 'roster'", "Duty Roster", "WHERE c.deleted_at IS NULL"]) {
  if (!rosterMigration.includes(marker)) failures.push(`duty roster migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM/i.test(rosterMigration)) {
  failures.push("duty roster migration: must not drop/delete production data.");
}
if (/status\s*=\s*'disabled'|is_enabled\s*=\s*0/i.test(rosterMigration)) {
  failures.push("duty roster migration: must not disable existing roster features.");
}
const contractMigration = exists("migrations/0083_contract_tracking_feature_setting.sql")
  ? read("migrations/0083_contract_tracking_feature_setting.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "contract_tracking", "Contract Tracking", "WHERE c.deleted_at IS NULL"]) {
  if (!contractMigration.includes(marker)) failures.push(`contract tracking migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM|UPDATE\s+feature_settings/i.test(contractMigration)) {
  failures.push("contract tracking migration: must remain additive and must not drop/delete/update existing data.");
}
const attendanceMigration = exists("migrations/0084_attendance_management_feature_settings.sql")
  ? read("migrations/0084_attendance_management_feature_settings.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "Attendance Management", "attendance.manual_entry_enabled", "attendance.kiosk_enabled", "attendance.biometric_enabled", "attendance.corrections_enabled", "attendance.payroll_deductions_enabled", "WHERE c.deleted_at IS NULL"]) {
  if (!attendanceMigration.includes(marker)) failures.push(`attendance management migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM|UPDATE\s+feature_settings/i.test(attendanceMigration)) {
  failures.push("attendance management migration: must remain additive and must not drop/delete/update existing data.");
}
const payrollMigration = exists("migrations/0085_payroll_management_feature_settings.sql")
  ? read("migrations/0085_payroll_management_feature_settings.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "Payroll Management", "payroll.salary_processing_enabled", "payroll.payslips_enabled", "payroll.advances_enabled", "payroll.salary_loans_enabled", "payroll.overtime_enabled", "payroll.benefits_enabled", "payroll.manual_deductions_enabled", "payroll.attendance_deductions_enabled", "payroll.long_leave_deductions_enabled", "payroll.approvals_enabled", "WHERE c.deleted_at IS NULL"]) {
  if (!payrollMigration.includes(marker)) failures.push(`payroll management migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM/i.test(payrollMigration)) {
  failures.push("payroll management migration: must not drop/delete production data.");
}
if (/status\s*=\s*'disabled'|is_enabled\s*=\s*0/i.test(payrollMigration)) {
  failures.push("payroll management migration: must not disable existing payroll features.");
}

mustInclude("feature seed", "seeds/feature-settings.seed.sql", ["asset_tracking", "Asset Tracking", "uniform_tracking", "Uniform Tracking", "leave_management", "Leave Management", "long_leave_management", "Long Leave Management", "roster", "Duty Roster", "contract_tracking", "Contract Tracking", "attendance", "Attendance Management", "payroll", "Payroll Management"]);
mustInclude("company settings seed", "seeds/company-settings.seed.sql", ["attendance.manual_entry_enabled", "attendance.kiosk_enabled", "attendance.biometric_enabled", "attendance.corrections_enabled", "attendance.payroll_deductions_enabled", "payroll.salary_processing_enabled", "payroll.payslips_enabled", "payroll.advances_enabled", "payroll.salary_loans_enabled", "payroll.overtime_enabled", "payroll.benefits_enabled", "payroll.manual_deductions_enabled", "payroll.attendance_deductions_enabled", "payroll.long_leave_deductions_enabled", "payroll.approvals_enabled"]);
mustInclude("bootstrap defaults", "src/modules/bootstrap/bootstrap.repository.ts", ["asset_tracking", "uniform_tracking", "leave_management", "long_leave_management", "roster", "Duty Roster", "contract_tracking", "Contract Tracking", "attendance", "Attendance Management", "payroll", "Payroll Management", "payroll.salary_processing_enabled", "applyBootstrapFeatureSelections"]);
mustInclude("backend module aliases", "src/config/module-codes.ts", ["asset_tracking", "uniform_tracking", "contract_tracking"]);
mustInclude("frontend module aliases", "frontend/src/config/moduleCodes.ts", ["asset_tracking", "uniform_tracking", "contract_tracking"]);
mustInclude("settings feature dependencies", "src/modules/settings/settings.constants.ts", [
  "long_leave_management: [\"leave_management\"]",
  "asset_tracking: [\"employee_management\"]",
  "uniform_tracking: [\"employee_management\"]",
  "roster: [\"employee_management\"]",
  "contract_tracking: [\"employee_management\"]",
  "attendance: [\"employee_management\"]",
  "payroll: [\"employee_management\"]",
  "payroll: \"Payroll Management\"",
  "roster: \"Duty Roster\"",
  "contract_tracking: \"Contract Tracking\"",
  "attendance: \"Attendance Management\"",
]);

mustInclude("leave routes", "src/routes/leave.routes.ts", ['requireFeature("leave_management")']);
mustInclude("long leave routes", "src/routes/long-leave.routes.ts", ['requireFeature("long_leave_management")']);
const assetRoutes = mustInclude("asset routes", "src/routes/assets.routes.ts", ['requireFeature("asset_tracking")']);
const uniformRoutes = mustInclude("uniform routes", "src/routes/uniforms.routes.ts", ['requireFeature("uniform_tracking")']);
mustInclude("roster routes", "src/routes/rosters.routes.ts", ['requireFeature("roster")', 'requireFeature("employee_management")']);
mustInclude("contract routes", "src/routes/contracts.routes.ts", ['requireFeature("employee_management")', 'requireFeature("contract_tracking")']);
mustInclude("employee contract routes", "src/routes/employees.routes.ts", ['requireFeature("contract_tracking")']);
mustInclude("attendance routes", "src/routes/attendance.routes.ts", ['requireFeature("attendance")', 'requireAttendanceSubFeature("attendance.manual_entry_enabled")', 'requireAttendanceSubFeature("attendance.corrections_enabled")']);
mustInclude("attendance sub-feature lookup route", "src/routes/attendance.routes.ts", ['"/subfeatures"', "controller.subFeatures"]);
mustInclude("kiosk routes", "src/routes/kiosk.routes.ts", ['requireFeature("attendance")', 'requireAttendanceSubFeature("attendance.kiosk_enabled")']);
mustInclude("biometric routes", "src/routes/biometric.routes.ts", ['requireFeature("attendance")', 'requireAttendanceSubFeature("attendance.biometric_enabled")']);
mustInclude("payroll report attendance route guards", "src/routes/payroll-reports.routes.ts", ['requireFeature("attendance")', 'requireAttendanceSubFeature("attendance.payroll_deductions_enabled")']);
mustInclude("payroll routes", "src/routes/payroll.routes.ts", ['requireFeature("payroll")', '"/subfeatures"', "controller.subFeatures", 'requirePayrollSubFeature("payroll.salary_processing_enabled")', 'requirePayrollSubFeature("payroll.payslips_enabled")', 'requirePayrollSubFeature("payroll.approvals_enabled")']);
mustInclude("payroll child routes", "src/routes/payroll.routes.ts", ['requirePayrollSubFeature("payroll.manual_deductions_enabled")']);
mustInclude("payroll advances routes", "src/routes/advances.routes.ts", ['requireFeature("payroll")', 'requireFeature("advance_salary")', 'requirePayrollSubFeature("payroll.advances_enabled")']);
mustInclude("payroll salary loans routes", "src/routes/salary-loans.routes.ts", ['requireFeature("payroll")', 'requirePayrollSubFeature("payroll.salary_loans_enabled")']);
mustInclude("payslips routes", "src/routes/payslips.routes.ts", ['requireFeature("payroll")', 'requireFeature("payslips")', 'requirePayrollSubFeature("payroll.payslips_enabled")']);
mustInclude("payroll reports routes", "src/routes/payroll-reports.routes.ts", ['requireFeature("payroll")', 'requirePayrollSubFeature("payroll.advances_enabled")', 'requirePayrollSubFeature("payroll.salary_loans_enabled")', 'requirePayrollSubFeature("payroll.overtime_enabled")', 'requirePayrollSubFeature("payroll.long_leave_deductions_enabled")']);
if (assetRoutes.includes('requireFeature("assets_uniforms")')) failures.push("asset routes: must not use legacy combined assets_uniforms guard.");
if (uniformRoutes.includes('requireFeature("assets_uniforms")')) failures.push("uniform routes: must not use legacy combined assets_uniforms guard.");

mustInclude("feature middleware disabled messages", "src/middleware/feature.middleware.ts", [
  "Leave Management is disabled. Enable it in Settings to use this module.",
  "Long Leave Management is disabled. Enable it in Settings to use this module.",
  "Asset Tracking is disabled. Enable it in Settings to use this module.",
  "Uniform Tracking is disabled. Enable it in Settings to use this module.",
  "Duty Roster is disabled. Enable it in Settings to use this module.",
  "Contract Tracking is disabled. Enable it in Settings to use this module.",
  "Attendance Management is disabled. Enable it in Settings to use this module.",
  "Manual Attendance is disabled.",
  "Kiosk Attendance is disabled.",
  "Biometric Attendance is disabled.",
  "Attendance Corrections are disabled.",
  "Attendance Payroll Deductions are disabled.",
  "Payroll Management is disabled. Enable it in Settings to use this module.",
  "Salary Processing is disabled.",
  "Payslips are disabled.",
  "Advance Salary is disabled.",
  "Salary Loans are disabled.",
  "Payroll Approvals are disabled.",
]);
mustInclude("payroll sub-feature settings helper", "src/services/settings.service.ts", [
  "PAYROLL_SUB_FEATURE_DEFAULTS",
  "getPayrollSubFeatureSettings",
  "isPayrollSubFeatureEnabled",
  "payroll.salary_processing_enabled",
  "payroll.attendance_deductions_enabled",
]);
mustInclude("payroll sub-feature lookup service", "src/modules/payroll/payroll.service.ts", [
  "getPayrollSubFeatures",
  "salary_processing_enabled",
  "manual_deductions_enabled",
  "attendance_deductions_enabled",
]);
mustInclude("auth me sub-feature snapshot", "src/modules/auth/auth.service.ts", [
  "payroll_subfeatures",
  "attendance_subfeatures",
  "getAuthPayrollSubFeatures",
  "getAuthAttendanceSubFeatures",
]);
mustInclude("attendance sub-feature lookup service", "src/modules/attendance/attendance.service.ts", [
  "getAttendanceSubFeatures",
  "attendance.manual_entry_enabled",
  "attendance.kiosk_enabled",
  "attendance.biometric_enabled",
  "attendance.corrections_enabled",
  "attendance.payroll_deductions_enabled",
]);

mustInclude("frontend router", "frontend/src/app/router.tsx", [
  'feature: "leave_management"',
  'moduleCode: "leave_management"',
  'moduleName: "Leave Management"',
  'feature: "long_leave_management"',
  'moduleCode: "long_leave_management"',
  'moduleName: "Long Leave Management"',
  'feature: "asset_tracking"',
  'moduleCode: "asset_tracking"',
  'moduleName: "Asset Tracking"',
  'feature: "uniform_tracking"',
  'moduleCode: "uniform_tracking"',
  'moduleName: "Uniform Tracking"',
  'feature: "roster"',
  'moduleCode: "roster"',
  'moduleName: "Duty Roster"',
  'featuresAll: ["roster", "employee_management"]',
  'featuresAll: ["employee_management", "contract_tracking"]',
  'moduleName: "Contract Tracking"',
  'feature: "attendance"',
  'feature: "payroll"',
  'moduleCode: "payroll"',
  'moduleName: "Payroll Management"',
  'featuresAll: ["payroll", "payslips"]',
  'featuresAll: ["payroll", "advance_salary"]',
  'featuresAll: ["reports", "payroll"]',
  'featuresAll: ["attendance", "offline_sync"]',
  'featuresAll: ["attendance", "biometric_attendance"]',
]);

mustInclude("navigation", "frontend/src/lib/navigation.ts", [
  'moduleCode: "leave_management"',
  'requiredFeature: "leave_management"',
  'moduleCode: "long_leave_management"',
  'requiredFeature: "long_leave_management"',
  'moduleCode: "asset_tracking"',
  'requiredFeature: "asset_tracking"',
  'moduleCode: "uniform_tracking"',
  'requiredFeature: "uniform_tracking"',
  'moduleCodesAll: ["roster", "employees"]',
  'requiredFeaturesAll: ["roster", "employee_management"]',
  'moduleCodesAll: ["employees", "contract_tracking"]',
  'requiredFeaturesAll: ["employee_management", "contract_tracking"]',
  'moduleCodesAll: ["attendance", "kiosk"]',
  'requiredFeaturesAll: ["attendance", "offline_sync"]',
  'moduleCodesAll: ["attendance", "biometric"]',
  'requiredFeaturesAll: ["attendance", "biometric_attendance"]',
  'moduleCodesAll: ["payroll", "payslips"]',
  'requiredFeaturesAll: ["payroll", "payslips"]',
  'moduleCodesAll: ["payroll", "advance_salary"]',
  'requiredFeaturesAll: ["payroll", "advance_salary"]',
  'requiredFeaturesAll: ["reports", "payroll"]',
]);

mustInclude("settings UI", "frontend/src/features/settings/FeatureSettingsPanel.tsx", [
  "Leave Management",
  "Long Leave Management",
  "Document Tracking",
  "Asset Tracking",
  "Uniform Tracking",
  "Duty Roster",
  "Contract Tracking",
  "Attendance Management",
  "Payroll Management",
  "Process employee salaries, advances, loans, overtime, benefits, deductions, payslips, and payroll approvals.",
  "Plan employee work schedules, weekly duty rosters, shift assignments, and roster change workflows.",
  "Track employee contracts, renewals, probation periods, linked contract documents, and contract expiry alerts.",
  "Track employee attendance, lateness, absences, corrections, biometric/kiosk entries, and attendance-based payroll review.",
  "Disabling this module hides it from normal use but does not delete existing records.",
  "Re-enabling restores access to preserved records and settings.",
]);
mustInclude("attendance structured settings", "frontend/src/features/settings/structured-settings.ts", [
  "Attendance Sub-Features",
  "Manual Attendance",
  "Kiosk Attendance",
  "Biometric Attendance",
  "Attendance Corrections",
  "Payroll Deductions from Attendance",
]);
mustInclude("payroll structured settings", "frontend/src/features/settings/structured-settings.ts", [
  "Payroll Management",
  "Payroll Sub-Features",
  "Salary Processing",
  "Payslips",
  "Advance Salary",
  "Salary Loans",
  "Overtime",
  "Benefits",
  "Manual Deductions",
  "Attendance Deductions",
  "Long Leave Deductions",
  "Payroll Approvals",
]);
const structuredSettings = read("frontend/src/features/settings/structured-settings.ts");
for (const duplicate of ["Manual attendance allowed", "Attendance correction allowed", "Kiosk attendance enabled", "Biometric attendance enabled", "Absent day deduction rule"]) {
  if (structuredSettings.includes(duplicate)) failures.push(`attendance settings UI: duplicate legacy switch is still visible: ${duplicate}`);
}
for (const duplicate of ["Monthly payroll enabled", "Advance payments enabled", "Salary loans enabled", "Payslip generation enabled"]) {
  if (structuredSettings.includes(duplicate)) failures.push(`payroll settings UI: duplicate legacy switch is still visible: ${duplicate}`);
}
mustInclude("attendance sub-feature frontend helper", "frontend/src/features/attendance/useAttendanceSubFeatures.ts", [
  "attendanceApi.subFeatures",
  "manualEntryEnabled",
  "kioskEnabled",
  "biometricEnabled",
  "correctionsEnabled",
  "payrollDeductionsEnabled",
]);
mustInclude("attendance page sub-feature UI guards", "frontend/src/features/attendance/AttendancePage.tsx", [
  "useAttendanceSubFeatures",
  "attendanceSubFeatures.manualEntryEnabled && auth.hasAnyPermission",
  "attendanceSubFeatures.correctionsEnabled && auth.hasAnyPermission",
]);
mustInclude("attendance corrections page sub-feature UI guards", "frontend/src/features/attendance/AttendanceCorrectionsPage.tsx", [
  "useAttendanceSubFeatures",
  "attendanceSubFeatures.correctionsEnabled && auth.hasAnyPermission",
  "Attendance Corrections are disabled.",
]);
mustInclude("kiosk page sub-feature UI guards", "frontend/src/features/devices/KioskDevicesPage.tsx", [
  "useAttendanceSubFeatures",
  "attendanceSubFeatures.kioskEnabled && auth.hasAnyPermission",
  "Kiosk Attendance is disabled.",
]);
mustInclude("biometric page sub-feature UI guards", "frontend/src/features/biometric/BiometricPage.tsx", [
  "useAttendanceSubFeatures",
  "attendanceSubFeatures.biometricEnabled && auth.hasPermission",
  "Biometric Attendance is disabled.",
]);
mustInclude("payroll attendance deduction frontend guards", "frontend/src/features/payroll-reports/PayrollReportsPage.tsx", [
  "useAttendanceSubFeatures",
  "attendanceSubFeatures.payrollDeductionsEnabled",
]);
mustInclude("payroll sub-feature frontend helper", "frontend/src/features/payroll/usePayrollSubFeatures.ts", [
  "payrollApi.subFeatures",
  "salaryProcessingEnabled",
  "payslipsEnabled",
  "advancesEnabled",
  "salaryLoansEnabled",
  "overtimeEnabled",
  "benefitsEnabled",
  "manualDeductionsEnabled",
  "attendanceDeductionsEnabled",
  "longLeaveDeductionsEnabled",
  "approvalsEnabled",
]);
mustInclude("frontend auth sub-feature snapshot", "frontend/src/features/auth/auth.store.tsx", [
  "payroll_subfeatures",
  "attendance_subfeatures",
  "payrollSubFeatures",
  "attendanceSubFeatures",
]);
mustInclude("navigation sub-feature access helper", "frontend/src/lib/navigationAccess.ts", [
  "hasPayrollSubFeature",
  "hasAttendanceSubFeature",
  "requiredPayrollSubFeature",
  "requiredAttendanceSubFeature",
]);
mustInclude("route guard sub-feature access", "frontend/src/features/auth/route-guards.tsx", [
  "requiredPayrollSubFeature",
  "requiredAttendanceSubFeature",
  "hasPayrollSubFeature",
  "hasAttendanceSubFeature",
  "ModuleDisabledPage",
]);
mustInclude("payroll page sub-feature UI guards", "frontend/src/features/payroll/PayrollPage.tsx", [
  "usePayrollSubFeatures",
  "payrollSubFeatures.salaryProcessingEnabled && hasPayrollPermission",
  "payrollSubFeatures.manualDeductionsEnabled &&",
  "payrollSubFeatures.approvalsEnabled &&",
  "Manual Deductions are disabled.",
]);
mustInclude("advances page sub-feature UI guards", "frontend/src/features/advances/AdvancesPage.tsx", [
  "usePayrollSubFeatures",
  "payrollSubFeatures.advancesEnabled &&",
  "Advance Salary is disabled.",
]);
mustInclude("salary loans page sub-feature UI guards", "frontend/src/features/salary-loans/SalaryLoansPage.tsx", [
  "usePayrollSubFeatures",
  "payrollSubFeatures.salaryLoansEnabled &&",
  "Salary Loans are disabled.",
]);
mustInclude("payslips page sub-feature UI guards", "frontend/src/features/payslips/PayslipsPage.tsx", [
  "usePayrollSubFeatures",
  "payrollSubFeatures.payslipsEnabled &&",
  "Payslips are disabled.",
]);
mustInclude("payroll item drawer sub-feature UI guards", "frontend/src/features/payroll/PayrollItemDetailDrawer.tsx", [
  "usePayrollSubFeatures",
  "payrollSubFeatures.payslipsEnabled",
  "payrollSubFeatures.benefitsEnabled",
  "payrollSubFeatures.attendanceDeductionsEnabled",
  "payrollSubFeatures.advancesEnabled",
  "payrollSubFeatures.salaryLoansEnabled",
]);
mustInclude("payroll sub-feature navigation", "frontend/src/lib/navigation.ts", [
  'requiredPayrollSubFeature: "payslips_enabled"',
  'requiredPayrollSubFeature: "advances_enabled"',
  'requiredPayrollSubFeature: "salary_loans_enabled"',
  'requiredPayrollSubFeature: "attendance_deductions_enabled"',
  'requiredAttendanceSubFeature: "payroll_deductions_enabled"',
]);
mustInclude("payroll sub-feature direct routes", "frontend/src/app/router.tsx", [
  'requiredPayrollSubFeature: "payslips_enabled"',
  'requiredPayrollSubFeature: "advances_enabled"',
  'requiredPayrollSubFeature: "salary_loans_enabled"',
  'requiredPayrollSubFeature: "attendance_deductions_enabled"',
  'requiredAttendanceSubFeature: "payroll_deductions_enabled"',
]);
mustInclude("bootstrap setup UI", "frontend/src/features/bootstrap/FirstTimeSetupForm.tsx", [
  "Operational modules",
  "Attendance Management",
  "Duty Roster",
  "Contract Tracking",
  "Disabled by choice: Attendance records stay safe",
  "Disabled by choice: Duty Roster setup tasks will be skipped until the module is enabled in Settings.",
  "Disabled by choice: Contract Tracking setup tasks will be skipped until the module is enabled in Settings.",
]);
mustInclude("bootstrap setup schema", "frontend/src/features/bootstrap/setup.schema.ts", ["features", "attendance", "roster", "contract_tracking"]);
mustInclude("bootstrap validator", "src/modules/bootstrap/bootstrap.validators.ts", ["features", "attendance", "roster", "contract_tracking"]);
mustInclude("dashboard roster gating", "src/modules/dashboard/dashboard.service.ts", [
  'moduleEnabled(features, "roster")',
  "Duty Roster Coverage",
  "Open Duty Roster",
]);
mustInclude("department dashboard roster fallback", "src/modules/dashboard/department-weekly-team.service.ts", [
  'featureEnabled(env, actor, "roster")',
  "Duty Roster module is disabled; shift labels and roster conflict metrics are unavailable.",
]);

mustInclude("employee 360", "frontend/src/features/employees/Employee360Page.tsx", [
  'auth.hasFeature("leave_management")',
  'auth.hasFeature("long_leave_management")',
  'auth.hasFeature("asset_tracking")',
  'auth.hasFeature("uniform_tracking")',
  'auth.hasFeature("contract_tracking")',
  'auth.hasFeature("attendance")',
  "canViewAttendance",
  "canViewAssetsUniforms",
  "canViewContracts",
]);
mustInclude("employee profile backend", "src/modules/employees/employees.service.ts", [
  '"asset_tracking"',
  '"uniform_tracking"',
  "ASSETS_UNIFORMS_DISABLED",
]);

mustInclude("reports route", "src/routes/reports.routes.ts", ['requireFeature("asset_tracking")']);
const hrReportsRoute = mustInclude("HR reports route", "src/routes/hr-reports.routes.ts", ['requireFeature("leave_management")', 'requireFeature("long_leave_management")', 'requireAnyFeature(["asset_tracking", "uniform_tracking"]', "ASSETS_UNIFORMS_REPORT_DISABLED"]);
if (hrReportsRoute.includes('hrReportsRoutes.get("/assets-uniforms", requireFeature("asset_tracking"), requireFeature("uniform_tracking")')) {
  failures.push("HR reports route: assets-uniforms must use an either-module guard, not sequential asset/uniform feature guards.");
}
if (/key === "assets-uniforms"[\s\S]{0,180}requireFeature\("asset_tracking"\)[\s\S]{0,180}requireFeature\("uniform_tracking"\)/.test(hrReportsRoute)) {
  failures.push("HR reports dynamic route: assets-uniforms must use an either-module guard, not sequential asset/uniform feature guards.");
}
mustInclude("HR reports route contract guard", "src/routes/hr-reports.routes.ts", ['requireFeature("contract_tracking")']);
mustInclude("HR reports service", "src/modules/hr-reports/hr-reports.service.ts", ["enabledCategories", "LEAVE_MANAGEMENT_DISABLED", "LONG_LEAVE_MANAGEMENT_DISABLED", "ASSETS_UNIFORMS_REPORT_DISABLED", "CONTRACT_TRACKING_DISABLED"]);
mustInclude("Payroll reports service", "src/modules/payroll-reports/payroll-reports.service.ts", ["enabledCategories", "LEAVE_MANAGEMENT_DISABLED", "LONG_LEAVE_MANAGEMENT_DISABLED", "PAYROLL_MANAGEMENT_DISABLED", "payrollSubFeatureEnabled"]);
mustInclude("Payroll attendance deduction service", "src/modules/payroll-reports/payroll-reports.service.ts", ["ATTENDANCE_MANAGEMENT_DISABLED", "ATTENDANCE_PAYROLL_DEDUCTIONS_DISABLED", "attendancePayrollDeductionsEnabled"]);
mustInclude("payroll calculator attendance deduction switch", "src/modules/payroll/payroll.calculator.ts", ['"attendance.payroll_deductions_enabled"']);
mustInclude("payroll service attendance deduction switch", "src/modules/payroll/payroll.service.ts", ["attendancePayrollDeductionsEnabled", "loadPayrollCalculationSettings"]);
mustInclude("report exports service", "src/modules/report-exports/report-exports.service.ts", ["asset_tracking", "uniform_tracking", "ASSETS_UNIFORMS_REPORT_DISABLED", "ATTENDANCE_MANAGEMENT_DISABLED", "ATTENDANCE_PAYROLL_DEDUCTIONS_DISABLED", "PAYROLL_MANAGEMENT_DISABLED", "payrollReportEnabledForKey"]);
mustInclude("report exports contract gating", "src/modules/report-exports/report-exports.service.ts", ["contract_tracking", "CONTRACT_TRACKING_DISABLED", "moduleEnabledForCatalogItem"]);
mustInclude("import-export service", "src/modules/import-export/export-job.service.ts", ["attendance", "leave_management", "payroll", "asset_tracking", "uniform_tracking", "ATTENDANCE_MANAGEMENT_DISABLED", "LEAVE_MANAGEMENT_DISABLED", "PAYROLL_MANAGEMENT_DISABLED", "ASSET_TRACKING_DISABLED", "UNIFORM_TRACKING_DISABLED"]);
mustInclude("legacy imports service", "src/modules/imports/imports.service.ts", ["assertAttendanceImportEnabled", "assertLeaveImportEnabled", "assertAssetsUniformsImportEnabled", "assertPayrollImportEnabled", "ATTENDANCE_MANAGEMENT_DISABLED", "LEAVE_MANAGEMENT_DISABLED", "ASSETS_UNIFORMS_IMPORT_DISABLED", "PAYROLL_MANAGEMENT_DISABLED"]);
mustInclude("import/export frontend", "frontend/src/features/import-export/ImportExportPage.tsx", ["visibleExportTypes", "usePayrollSubFeatures", 'auth.hasFeature("attendance")', 'auth.hasFeature("leave_management")', 'auth.hasFeature("payroll")', "payrollSubFeatures.salaryProcessingEnabled", 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);
mustInclude("HR reports frontend", "frontend/src/features/hr-reports/HrReportsPage.tsx", ["visibleCategories", 'auth.hasFeature("leave_management")', 'auth.hasFeature("long_leave_management")', 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);
mustInclude("contract document independence", "frontend/src/features/contracts/ContractFormDialog.tsx", ["Document Tracking is disabled. Contract metadata can be saved"]);
mustInclude("contract document downloads", "frontend/src/features/contracts/ContractDocumentAction.tsx", ["linked document download requires Document Tracking"]);
mustInclude("Payroll reports frontend", "frontend/src/features/payroll-reports/PayrollReportsPage.tsx", ["visibleCategories", "usePayrollSubFeatures", 'auth.hasFeature("payroll")', 'auth.hasFeature("attendance")', 'auth.hasFeature("leave_management")', 'auth.hasFeature("long_leave_management")', "payrollSubFeatures.advancesEnabled", "payrollSubFeatures.salaryLoansEnabled", "payrollSubFeatures.overtimeEnabled", "payrollSubFeatures.payslipsEnabled", "payrollSubFeatures.approvalsEnabled", "payrollSubFeatures.longLeaveDeductionsEnabled"]);

if (failures.length) {
  console.error("Module toggle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Module toggle verification passed.");
}
