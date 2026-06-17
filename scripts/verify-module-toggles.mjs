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

mustInclude("feature seed", "seeds/feature-settings.seed.sql", ["asset_tracking", "Asset Tracking", "uniform_tracking", "Uniform Tracking", "leave_management", "Leave Management", "long_leave_management", "Long Leave Management"]);
mustInclude("bootstrap defaults", "src/modules/bootstrap/bootstrap.repository.ts", ["asset_tracking", "uniform_tracking", "leave_management", "long_leave_management"]);
mustInclude("backend module aliases", "src/config/module-codes.ts", ["asset_tracking", "uniform_tracking"]);
mustInclude("frontend module aliases", "frontend/src/config/moduleCodes.ts", ["asset_tracking", "uniform_tracking"]);
mustInclude("settings feature dependencies", "src/modules/settings/settings.constants.ts", [
  "long_leave_management: [\"leave_management\", \"payroll\"]",
  "asset_tracking: [\"employee_management\"]",
  "uniform_tracking: [\"employee_management\"]",
]);

mustInclude("leave routes", "src/routes/leave.routes.ts", ['requireFeature("leave_management")']);
mustInclude("long leave routes", "src/routes/long-leave.routes.ts", ['requireFeature("long_leave_management")']);
const assetRoutes = mustInclude("asset routes", "src/routes/assets.routes.ts", ['requireFeature("asset_tracking")']);
const uniformRoutes = mustInclude("uniform routes", "src/routes/uniforms.routes.ts", ['requireFeature("uniform_tracking")']);
if (assetRoutes.includes('requireFeature("assets_uniforms")')) failures.push("asset routes: must not use legacy combined assets_uniforms guard.");
if (uniformRoutes.includes('requireFeature("assets_uniforms")')) failures.push("uniform routes: must not use legacy combined assets_uniforms guard.");

mustInclude("feature middleware disabled messages", "src/middleware/feature.middleware.ts", [
  "Leave Management is disabled. Enable it in Settings to use this module.",
  "Long Leave Management is disabled. Enable it in Settings to use this module.",
  "Asset Tracking is disabled. Enable it in Settings to use this module.",
  "Uniform Tracking is disabled. Enable it in Settings to use this module.",
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
]);

mustInclude("settings UI", "frontend/src/features/settings/FeatureSettingsPanel.tsx", [
  "Leave Management",
  "Long Leave Management",
  "Document Tracking",
  "Asset Tracking",
  "Uniform Tracking",
  "Disabling this module hides it from normal use but does not delete existing records.",
]);

mustInclude("employee 360", "frontend/src/features/employees/Employee360Page.tsx", [
  'auth.hasFeature("leave_management")',
  'auth.hasFeature("long_leave_management")',
  'auth.hasFeature("asset_tracking")',
  'auth.hasFeature("uniform_tracking")',
  "canViewAssetsUniforms",
]);
mustInclude("employee profile backend", "src/modules/employees/employees.service.ts", [
  '"asset_tracking"',
  '"uniform_tracking"',
  "ASSETS_UNIFORMS_DISABLED",
]);

mustInclude("reports route", "src/routes/reports.routes.ts", ['requireFeature("asset_tracking")']);
mustInclude("HR reports route", "src/routes/hr-reports.routes.ts", ['requireFeature("leave_management")', 'requireFeature("long_leave_management")', 'requireFeature("asset_tracking")', 'requireFeature("uniform_tracking")']);
mustInclude("HR reports service", "src/modules/hr-reports/hr-reports.service.ts", ["enabledCategories", "LEAVE_MANAGEMENT_DISABLED", "LONG_LEAVE_MANAGEMENT_DISABLED", "ASSETS_UNIFORMS_REPORT_DISABLED"]);
mustInclude("Payroll reports service", "src/modules/payroll-reports/payroll-reports.service.ts", ["enabledCategories", "LEAVE_MANAGEMENT_DISABLED", "LONG_LEAVE_MANAGEMENT_DISABLED"]);
mustInclude("report exports service", "src/modules/report-exports/report-exports.service.ts", ["asset_tracking", "uniform_tracking", "ASSETS_UNIFORMS_REPORT_DISABLED"]);
mustInclude("import-export service", "src/modules/import-export/export-job.service.ts", ["leave_management", "asset_tracking", "uniform_tracking", "LEAVE_MANAGEMENT_DISABLED", "ASSET_TRACKING_DISABLED", "UNIFORM_TRACKING_DISABLED"]);
mustInclude("legacy imports service", "src/modules/imports/imports.service.ts", ["assertLeaveImportEnabled", "assertAssetsUniformsImportEnabled", "LEAVE_MANAGEMENT_DISABLED", "ASSETS_UNIFORMS_IMPORT_DISABLED"]);
mustInclude("import/export frontend", "frontend/src/features/import-export/ImportExportPage.tsx", ["visibleExportTypes", 'auth.hasFeature("leave_management")', 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);
mustInclude("HR reports frontend", "frontend/src/features/hr-reports/HrReportsPage.tsx", ["visibleCategories", 'auth.hasFeature("leave_management")', 'auth.hasFeature("long_leave_management")', 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);
mustInclude("Payroll reports frontend", "frontend/src/features/payroll-reports/PayrollReportsPage.tsx", ["visibleCategories", 'auth.hasFeature("leave_management")', 'auth.hasFeature("long_leave_management")']);

if (failures.length) {
  console.error("Module toggle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Module toggle verification passed.");
}
