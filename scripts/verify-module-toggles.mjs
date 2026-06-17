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

const migration = exists("migrations/0080_asset_uniform_tracking_feature_settings.sql")
  ? read("migrations/0080_asset_uniform_tracking_feature_settings.sql")
  : "";
for (const marker of ["INSERT OR IGNORE INTO feature_settings", "asset_tracking", "uniform_tracking", "WHERE c.deleted_at IS NULL"]) {
  if (!migration.includes(marker)) failures.push(`migration: missing ${marker}`);
}
if (/DROP\s+|DELETE\s+FROM|UPDATE\s+feature_settings/i.test(migration)) {
  failures.push("migration: module toggle migration must remain additive and must not drop/delete/update existing data.");
}

mustInclude("feature seed", "seeds/feature-settings.seed.sql", ["asset_tracking", "Asset Tracking", "uniform_tracking", "Uniform Tracking"]);
mustInclude("bootstrap defaults", "src/modules/bootstrap/bootstrap.repository.ts", ["asset_tracking", "uniform_tracking"]);
mustInclude("backend module aliases", "src/config/module-codes.ts", ["asset_tracking", "uniform_tracking"]);
mustInclude("frontend module aliases", "frontend/src/config/moduleCodes.ts", ["asset_tracking", "uniform_tracking"]);
mustInclude("settings feature dependencies", "src/modules/settings/settings.constants.ts", [
  "asset_tracking: [\"employee_management\"]",
  "uniform_tracking: [\"employee_management\"]",
]);

const assetRoutes = mustInclude("asset routes", "src/routes/assets.routes.ts", ['requireFeature("asset_tracking")']);
const uniformRoutes = mustInclude("uniform routes", "src/routes/uniforms.routes.ts", ['requireFeature("uniform_tracking")']);
if (assetRoutes.includes('requireFeature("assets_uniforms")')) failures.push("asset routes: must not use legacy combined assets_uniforms guard.");
if (uniformRoutes.includes('requireFeature("assets_uniforms")')) failures.push("uniform routes: must not use legacy combined assets_uniforms guard.");

mustInclude("feature middleware disabled messages", "src/middleware/feature.middleware.ts", [
  "Asset Tracking is disabled. Enable it in Settings to use this module.",
  "Uniform Tracking is disabled. Enable it in Settings to use this module.",
]);

mustInclude("frontend router", "frontend/src/app/router.tsx", [
  'feature: "asset_tracking"',
  'moduleCode: "asset_tracking"',
  'moduleName: "Asset Tracking"',
  'feature: "uniform_tracking"',
  'moduleCode: "uniform_tracking"',
  'moduleName: "Uniform Tracking"',
]);

mustInclude("navigation", "frontend/src/lib/navigation.ts", [
  'moduleCode: "asset_tracking"',
  'requiredFeature: "asset_tracking"',
  'moduleCode: "uniform_tracking"',
  'requiredFeature: "uniform_tracking"',
]);

mustInclude("settings UI", "frontend/src/features/settings/FeatureSettingsPanel.tsx", [
  "Document Tracking",
  "Asset Tracking",
  "Uniform Tracking",
  "Disabling this module hides it from normal use but does not delete existing records.",
]);

mustInclude("employee 360", "frontend/src/features/employees/Employee360Page.tsx", [
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
mustInclude("HR reports route", "src/routes/hr-reports.routes.ts", ['requireFeature("asset_tracking")', 'requireFeature("uniform_tracking")']);
mustInclude("HR reports service", "src/modules/hr-reports/hr-reports.service.ts", ["enabledCategories", "ASSETS_UNIFORMS_REPORT_DISABLED"]);
mustInclude("report exports service", "src/modules/report-exports/report-exports.service.ts", ["asset_tracking", "uniform_tracking", "ASSETS_UNIFORMS_REPORT_DISABLED"]);
mustInclude("import-export service", "src/modules/import-export/export-job.service.ts", ["asset_tracking", "uniform_tracking", "ASSET_TRACKING_DISABLED", "UNIFORM_TRACKING_DISABLED"]);
mustInclude("legacy imports service", "src/modules/imports/imports.service.ts", ["assertAssetsUniformsImportEnabled", "ASSETS_UNIFORMS_IMPORT_DISABLED"]);
mustInclude("import/export frontend", "frontend/src/features/import-export/ImportExportPage.tsx", ["visibleExportTypes", 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);
mustInclude("HR reports frontend", "frontend/src/features/hr-reports/HrReportsPage.tsx", ["visibleCategories", 'auth.hasFeature("asset_tracking")', 'auth.hasFeature("uniform_tracking")']);

if (failures.length) {
  console.error("Module toggle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Module toggle verification passed.");
}
