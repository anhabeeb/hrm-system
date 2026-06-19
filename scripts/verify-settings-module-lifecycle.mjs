import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const mustInclude = (label, file, markers) => {
  if (!exists(file)) {
    failures.push(`${label}: missing file ${file}`);
    return "";
  }
  const text = read(file);
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${label}: missing ${marker}`);
  }
  return text;
};

const mustNotInclude = (label, file, markers) => {
  if (!exists(file)) {
    failures.push(`${label}: missing file ${file}`);
    return "";
  }
  const text = read(file);
  for (const marker of markers) {
    if (text.includes(marker)) failures.push(`${label}: should not expose ${marker}`);
  }
  return text;
};

const legacyPanelName = ["FeatureSettings", "Panel"].join("");
const legacyPanelPath = `frontend/src/features/settings/${legacyPanelName}.tsx`;

if (exists(legacyPanelPath)) {
  failures.push("Legacy editable global module toggle panel should be removed; module availability is managed from module settings pages.");
}
const moduleStatusOverview = mustInclude("Module Status Overview", "frontend/src/features/settings/ModuleStatusOverview.tsx", [
  "mainFeatureOrder",
  "Module Status Overview",
  "Open module settings",
  "data-setup-target=\"module-status-overview\"",
]);
const moduleAvailability = mustInclude("Module Availability Panel", "frontend/src/features/settings/ModuleAvailabilityPanel.tsx", [
  "ModuleAvailabilityPanel",
  "Dependencies",
  "Required by",
  "Last changed:",
  "Audit",
  "missingDependencies",
  "activeDependents",
  "Disable dependent modules first.",
  "settingsApi.updateFeature",
]);
const featureMetadata = mustInclude("Module metadata", "frontend/src/features/settings/module-feature-metadata.ts", [
  "mainFeatureOrder",
  "Document Tracking",
  "Asset Tracking",
  "Uniform Tracking",
  "Leave Management",
  "Long Leave Management",
  "Duty Roster",
  "Contract Tracking",
  "Attendance Management",
  "Payroll Management",
  "Disabling this module hides it from normal use but does not delete existing records.",
]);
const moduleAvailabilitySource = `${moduleStatusOverview}\n${moduleAvailability}\n${featureMetadata}`;
if (moduleAvailabilitySource.includes('header: "Key"')) {
  failures.push("Module availability UI: raw feature keys must not be shown as a normal user-facing column.");
}
if (!moduleAvailabilitySource.includes("mainFeatureOrder") || (moduleAvailabilitySource.match(/mainFeatureOrder/g) ?? []).length < 2) {
  failures.push("Module availability UI: primary module list must drive the visible rows.");
}

const structuredSettings = mustInclude("Structured settings definitions", "frontend/src/features/settings/structured-settings.ts", [
  "parentFeatureKey",
  'parentFeatureKey: "attendance"',
  'parentFeatureKey: "payroll"',
  'parentFeatureKey: "leave_management"',
  'parentFeatureKey: "documents"',
  "Attendance Sub-Features",
  "Payroll Sub-Features",
  "Legacy aliases are kept backend-compatible but hidden from standard settings.",
  "Duty Roster module availability is controlled from the Module Availability section",
  "Contract Tracking module availability is controlled from the Module Availability section",
]);
for (const duplicate of [
  "roster_module_enabled",
  "leave_module_enabled",
  "long_leave_enabled",
  "document_module_enabled",
  "contract_tracking_enabled",
]) {
  if (structuredSettings.includes(duplicate)) {
    failures.push(`Structured settings definitions: duplicate visible module switch remains: ${duplicate}`);
  }
}

mustInclude("Structured settings panel", "frontend/src/features/settings/StructuredSettingsPanel.tsx", [
  "settingsApi.features",
  "parentFeature",
  "parentDisabled",
  "controlsDisabled",
  "Enable this module from its Module Availability section before changing sub-feature settings.",
  "Existing settings are preserved and will be restored when the module is re-enabled.",
]);

const settingsConstants = mustInclude("Settings constants", "src/modules/settings/settings.constants.ts", [
  "MODULE_LIFECYCLE_METADATA",
  "disabled_by_choice",
  "needs_setup_after_enable",
  "review_recommended",
  'documents: ["employee_management"]',
  'asset_tracking: ["employee_management"]',
  'uniform_tracking: ["employee_management"]',
  'leave_management',
  'long_leave_management: ["leave_management"]',
  'roster: ["employee_management"]',
  'contract_tracking: ["employee_management"]',
  'attendance: ["employee_management"]',
  'payroll: ["employee_management"]',
]);
if (settingsConstants.includes('long_leave_management: ["leave_management", "payroll"]')) {
  failures.push("Settings constants: Long Leave Management should depend on Leave Management only; payroll deduction dependencies are separate.");
}
for (const moduleKey of [
  "documents",
  "asset_tracking",
  "uniform_tracking",
  "leave_management",
  "long_leave_management",
  "roster",
  "contract_tracking",
  "attendance",
  "payroll",
]) {
  if (!settingsConstants.includes(`${moduleKey}: {`) && !settingsConstants.includes(`${moduleKey}: [`)) {
    failures.push(`Settings lifecycle metadata: missing ${moduleKey}.`);
  }
}

mustInclude("Settings service lifecycle dependency guard", "src/modules/settings/settings.service.ts", [
  "validateSettingsLifecycleDependencies",
  "validateFeatureDisableSettingsDependencies",
  "validateFeatureDependencies(featureKey, false, enabledFeatures)",
  "Disable Attendance Payroll Deductions and Payroll Attendance Deductions before disabling Attendance Management.",
  "Disable payroll deduction sub-features before disabling Payroll Management.",
  "Attendance payroll deductions require Payroll Management to be enabled first.",
  "Payroll attendance deductions require Attendance Management to be enabled first.",
  "Payroll attendance deductions require Attendance Payroll Deductions to be enabled first.",
  "Payroll long leave deductions require Long Leave Management to be enabled first.",
  "Long Leave Management requires Leave Management to be enabled first.",
  "Contract document upload requires Contract Tracking and Document Tracking to be enabled first.",
  "createSettingsChangeLog",
  "auditSettingsChange",
  "feature_enabled",
  "feature_disabled",
]);
mustInclude("Settings dependency validator", "src/modules/settings/settings.validators.ts", [
  "validateFeatureDependencies",
  "validateNoEnabledDependentsBeforeDisable",
  "FEATURE_DEPENDENCIES",
  "Disable ${FEATURE_DEPENDENCY_LABELS[dependentFeature]",
]);
mustInclude("Feature middleware disabled messages", "src/middleware/feature.middleware.ts", [
  "Document Tracking is disabled. Enable it in Settings to use this module.",
  "Asset Tracking is disabled. Enable it in Settings to use this module.",
  "Uniform Tracking is disabled. Enable it in Settings to use this module.",
  "Leave Management is disabled. Enable it in Settings to use this module.",
  "Long Leave Management is disabled. Enable it in Settings to use this module.",
  "Duty Roster is disabled. Enable it in Settings to use this module.",
  "Contract Tracking is disabled. Enable it in Settings to use this module.",
  "Attendance Management is disabled. Enable it in Settings to use this module.",
  "Payroll Management is disabled. Enable it in Settings to use this module.",
]);
mustInclude("Module lifecycle tests", "tests/module-toggles.test.ts", [
  'long_leave_management: ["leave_management"]',
  "roster_module_enabled",
  "leave_module_enabled",
  "long_leave_enabled",
  "document_module_enabled",
  "contract_tracking_enabled",
  "parentDisabled",
]);
mustInclude("Settings dependency tests", "tests/settings.test.ts", [
  "blocks enabling long leave until Leave Management is enabled",
  "blocks disabling Leave Management while Long Leave Management is enabled",
  "validateNoEnabledDependentsBeforeDisable",
]);
mustInclude("Settings lifecycle service tests", "tests/admin-settings-pages.test.ts", [
  "keeps backend lifecycle dependency checks for parent modules and sub-features",
  "Payroll attendance deductions require Attendance Payroll Deductions to be enabled first.",
  "Contract document upload requires Contract Tracking and Document Tracking to be enabled first.",
]);

const validators = read("src/modules/settings/settings.validators.ts");
if (/if\s*\(!isEnabling\)\s*{\s*return;\s*}/.test(validators)) {
  failures.push("Settings dependency validator: disabling still returns early without reverse dependency validation.");
}

if (exists(legacyPanelPath)) {
  mustNotInclude("Settings files", legacyPanelPath, [
    "Switch",
    "DataTable",
    "settingsApi.updateFeature",
    "dark:",
    "window.alert",
    "window.confirm",
  ]);
}
mustNotInclude("Settings metadata", "frontend/src/features/settings/module-feature-metadata.ts", [
  "dark:",
  "window.alert",
  "window.confirm",
]);
mustNotInclude("Structured settings panel", "frontend/src/features/settings/StructuredSettingsPanel.tsx", [
  "dark:",
  "window.alert",
  "window.confirm",
]);

if (failures.length) {
  console.error("Settings module lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Settings module lifecycle verification passed.");
}
