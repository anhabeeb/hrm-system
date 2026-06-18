import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const failures = [];
const expectFile = (file) => {
  if (!fs.existsSync(path.join(root, file))) failures.push(`${file} is missing.`);
};
const expectContains = (file, markers) => {
  const text = read(file);
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${file} is missing marker: ${marker}`);
  }
};

expectFile("src/modules/notifications/module-aware-alerts.ts");

expectContains("src/modules/notifications/module-aware-alerts.ts", [
  "isNotificationPayloadModuleEnabled",
  "getEnabledNotificationCategories",
  "isExpirySourceTypeEnabled",
  "getEnabledExpirySourceTypes",
  "attendance.corrections_enabled",
  "attendance.kiosk_enabled",
  "attendance.biometric_enabled",
  "attendance.payroll_deductions_enabled",
  "payroll.payslips_enabled",
  "payroll.advances_enabled",
  "payroll.salary_loans_enabled",
  "payroll.overtime_enabled",
  "payroll.benefits_enabled",
  "payroll.manual_deductions_enabled",
  "payroll.attendance_deductions_enabled",
  "payroll.long_leave_deductions_enabled",
  "payroll.approvals_enabled",
  "document_tracking",
  "contract_tracking",
  "long_leave_management",
  "asset_tracking",
  "uniform_tracking",
  "backup",
]);

const moduleAwareAlerts = read("src/modules/notifications/module-aware-alerts.ts");
const payrollRequirementBody = moduleAwareAlerts.slice(
  moduleAwareAlerts.indexOf("const payrollRequirementForPayload"),
  moduleAwareAlerts.indexOf("export const isNotificationPayloadModuleEnabled"),
);
const attendanceDeductionIndex = payrollRequirementBody.indexOf("attendance_deduction");
const longLeaveDeductionIndex = payrollRequirementBody.indexOf("long_leave_deduction");
const manualDeductionIndex = payrollRequirementBody.indexOf("manual_deduction");
if (attendanceDeductionIndex === -1 || longLeaveDeductionIndex === -1 || manualDeductionIndex === -1) {
  failures.push("payrollRequirementForPayload must explicitly classify attendance_deduction, long_leave_deduction, and manual_deduction.");
}
if (manualDeductionIndex !== -1 && attendanceDeductionIndex !== -1 && manualDeductionIndex < attendanceDeductionIndex) {
  failures.push("manual_deduction classification must not appear before attendance_deduction classification.");
}
if (manualDeductionIndex !== -1 && longLeaveDeductionIndex !== -1 && manualDeductionIndex < longLeaveDeductionIndex) {
  failures.push("manual_deduction classification must not appear before long_leave_deduction classification.");
}
if (payrollRequirementBody.includes('"deduction"') || payrollRequirementBody.includes("'deduction'")) {
  failures.push("payrollRequirementForPayload must not use a broad standalone deduction token that can capture attendance or long-leave deductions.");
}

expectContains("src/modules/notifications/notifications.service.ts", [
  "isNotificationPayloadModuleEnabled",
  "getEnabledNotificationCategories",
  "skipped_disabled_module",
  "NOTIFICATION_CATEGORY_DISABLED",
  "categories:",
]);

expectContains("src/modules/email-notifications/email-notifications.service.ts", [
  "isNotificationPayloadModuleEnabled",
  "getEnabledNotificationCategories",
  "EMAIL_CATEGORY_DISABLED",
  "skipped_disabled_module",
  "allowed_categories",
]);

expectContains("src/modules/expiry-alerts/expiry-alerts.service.ts", [
  "applyEnabledExpirySourceToggles",
  "getEnabledExpirySourceTypes",
  "isExpirySourceTypeEnabled",
  "contracts",
  "assets",
  "uniforms",
  "skipped_disabled_module",
]);

expectContains("src/modules/dashboard/dashboard.service.ts", [
  "getEnabledExpirySourceTypes",
  "getEnabledNotificationCategories",
  "withoutDisabledExpiryCounts",
  "sourceTypes",
]);

expectContains("src/modules/dashboard/dashboard.repository.ts", [
  "sourceTypes",
  "category IN",
  "notificationCounts",
]);

expectContains("frontend/src/features/notifications/NotificationsPage.tsx", [
  "visibleCategories",
  "notificationCategoryVisible",
  "payrollSubFeatureOn",
  "attendanceSubFeatureOn",
]);

expectContains("tests/notifications.test.ts", [
  "does not create leave notifications when Leave Management is disabled",
  "does not create attendance correction notifications when the sub-feature is disabled",
  "does not create payslip notifications when payslips are disabled",
  "uses attendance deduction settings for attendance deduction notifications",
  "does not let manual deduction settings control attendance deductions",
  "uses long leave deduction settings for long leave deduction notifications",
  "does not let manual deduction settings control long leave deductions",
  "uses manual deduction settings for manual deduction notifications",
]);

expectContains("tests/email-notifications.test.ts", [
  "uses attendance deduction settings for attendance deduction email jobs",
  "does not let manual deduction settings control attendance deduction email jobs",
  "uses long leave deduction settings for long leave deduction email jobs",
  "does not let manual deduction settings control long leave deduction email jobs",
  "uses manual deduction settings for manual deduction email jobs",
]);

expectContains("tests/expiry-alerts.test.ts", [
  "does not collect document expiry sources when Document Tracking is disabled",
  "does not collect contract or long-leave expiry sources when those modules are disabled",
]);

if (failures.length > 0) {
  console.error("Module-aware alerts verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Module-aware alerts verification passed.");
