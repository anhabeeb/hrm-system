import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const exists = (path) => existsSync(resolve(root, path));
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const assertFile = (path) => {
  assert(exists(path), `${path} is missing.`);
  return exists(path) ? read(path) : "";
};

const packageJson = JSON.parse(assertFile("package.json") || "{}");
assert(
  packageJson.scripts?.["verify:settings-navigation-ux"] === "node scripts/verify-settings-navigation-ux.mjs",
  "package.json must expose verify:settings-navigation-ux.",
);

const moduleAvailability = assertFile("frontend/src/features/settings/ModuleAvailabilityPanel.tsx");
const featureDialog = assertFile("frontend/src/features/settings/FeatureReasonDialog.tsx");
const structuredPanel = assertFile("frontend/src/features/settings/StructuredSettingsPanel.tsx");
const moduleMetadata = assertFile("frontend/src/features/settings/module-feature-metadata.ts");
const modulePages = assertFile("frontend/src/features/settings/module/ModuleSettingsPages.tsx");
const settingsPage = assertFile("frontend/src/features/settings/SettingsPage.tsx");
const moduleStatusOverview = assertFile("frontend/src/features/settings/ModuleStatusOverview.tsx");
const settingsApi = assertFile("frontend/src/features/settings/settings.api.ts");
const router = assertFile("frontend/src/app/router.tsx");
const navigation = assertFile("frontend/src/lib/navigation.ts");
const navigationAccess = assertFile("frontend/src/lib/navigationAccess.ts");
const moduleAccess = assertFile("frontend/src/lib/moduleAccess.ts");
const routeGuards = assertFile("frontend/src/features/auth/route-guards.tsx");
const leaveSettings = assertFile("frontend/src/features/settings/leave/LeaveSettingsPage.tsx");
const leavePolicyRulesSettings = assertFile("frontend/src/features/settings/leave/LeavePolicyRulesSettingsPanel.tsx");
const leaveTypesPanel = assertFile("frontend/src/features/leave/LeaveTypesPanel.tsx");
const setupGuideRegistry = assertFile("src/modules/setup-guide/setup-guide.registry.ts");
const setupGuideService = assertFile("src/modules/setup-guide/setup-guide.service.ts");
const validators = assertFile("src/modules/settings/settings.validators.ts");
const deploymentChecklist = assertFile("docs/production-deployment-checklist.md");

for (const featureKey of [
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
  assert(moduleMetadata.includes(featureKey), `module metadata missing ${featureKey}.`);
}

for (const marker of [
  "nonDestructiveModuleWarning",
  "FeatureReasonDialog",
  "settingsApi.updateFeature",
  "effective_from",
  "auth.refreshMe()",
  'queryKey: ["navigation"]',
  'queryKey: ["dashboard"]',
  'queryKey: ["dashboard-preferences"]',
]) {
  assert(moduleAvailability.includes(marker), `module availability flow missing ${marker}.`);
}

assert(moduleAvailability.includes("activeDependents"), "ModuleAvailabilityPanel must show active dependent modules.");
assert(moduleAvailability.includes("Dependencies"), "ModuleAvailabilityPanel must show required dependencies.");
assert(moduleAvailability.includes("Effective from"), "ModuleAvailabilityPanel must show effective date audit context.");
assert(moduleAvailability.includes("Disable module") && moduleAvailability.includes("Enable module"), "ModuleAvailabilityPanel must expose enable/disable actions.");
assert(featureDialog.includes("AppDatePicker"), "FeatureReasonDialog must use AppDatePicker.");
assert(featureDialog.includes("effective_from"), "FeatureReasonDialog must submit effective_from.");
assert(featureDialog.includes("Effective from"), "FeatureReasonDialog must label the effective date field.");

assert(settingsApi.includes("effective_date"), "settings API must accept effective_date for grouped settings.");
assert(structuredPanel.includes("AppDatePicker"), "StructuredSettingsPanel must use AppDatePicker for effective dates.");
assert(structuredPanel.includes("effective_date"), "StructuredSettingsPanel must submit effective_date.");
assert(structuredPanel.includes("requiresEffectiveDate"), "StructuredSettingsPanel must require effective dates for lifecycle-sensitive groups.");
assert(!exists("frontend/src/features/settings/FeatureSettingsPanel.tsx"), "unused editable global FeatureSettingsPanel.tsx must be removed.");
assert(!settingsPage.includes("FeatureSettingsPanel"), "All Settings page must not import/render editable global module toggles.");
assert(!settingsPage.includes("Switch"), "All Settings page must not expose direct module toggle switches.");
assert(settingsPage.includes("<ModuleStatusOverview"), "All Settings page must show a read-only module status overview.");
assert(moduleStatusOverview.includes("Module Status Overview"), "ModuleStatusOverview must clearly render a read-only module status section.");
assert(moduleStatusOverview.includes('data-setup-target="module-status-overview"'), "ModuleStatusOverview must expose the module-status-overview setup target.");
assert(moduleStatusOverview.includes("Open module settings"), "ModuleStatusOverview must link users to module-specific settings pages.");

for (const [path, source] of [
  ["StructuredSettingsPanel.tsx", structuredPanel],
  ["structured-settings.ts", assertFile("frontend/src/features/settings/structured-settings.ts")],
  ["AttendanceSettingsPage.tsx", assertFile("frontend/src/features/settings/attendance/AttendanceSettingsPage.tsx")],
  ["setup-guide.registry.ts", setupGuideRegistry],
  ["ModuleStatusOverview.tsx", moduleStatusOverview],
  ["SettingsPage.tsx", settingsPage],
  ["production-deployment-checklist.md", deploymentChecklist],
]) {
  for (const forbidden of [
    "Feature Controls",
    "Enable it in Feature Controls",
    "controlled from Feature Controls",
    "reviewed from Feature Controls",
    "Feature module choices have been reviewed from Feature Controls",
  ]) {
    assert(!source.includes(forbidden), `${path} still contains user-facing stale wording: ${forbidden}`);
  }
}

for (const [label, source] of [
  ["module access", moduleAccess],
  ["navigation access", navigationAccess],
  ["route guards", routeGuards],
]) {
  assert(!source.includes("moduleCode ?? requiredFeature"), `${label} must not use moduleCode ?? requiredFeature fallback.`);
  assert(!source.includes("moduleCodesAll ?? requiredFeaturesAll"), `${label} must not collapse moduleCodesAll and requiredFeaturesAll.`);
}
assert(moduleAccess.includes("isRouteFeatureAllowed"), "moduleAccess must expose isRouteFeatureAllowed.");
assert(moduleAccess.includes("hasFeature(user, options.requiredFeature)"), "moduleAccess must check requiredFeature exactly.");
assert(moduleAccess.includes("areRequiredFeaturesEnabled(user, options.requiredFeaturesAll)"), "moduleAccess must check requiredFeaturesAll exactly.");
assert(navigationAccess.includes("requiredFeature: item.requiredFeature"), "canAccessNavItem must pass requiredFeature separately.");
assert(routeGuards.includes("isRouteFeatureAllowed(user, { moduleCode, requiredFeature, moduleCodesAll, requiredFeaturesAll })"), "ModuleRoute must check module and required feature guards together.");

for (const path of ["/settings/assets", "/settings/uniforms", "/settings/roster", "/settings/contracts"]) {
  assert(router.includes(`path="${path}"`) || router.includes(`path=\\"${path}\\"`), `router missing ${path}.`);
  assert(navigation.includes(`path: "${path}"`), `navigation missing ${path}.`);
}
assert(!router.includes('path="/settings/leave/policy-rules"'), "Leave Policy Rules must live inside /settings/leave, not a standalone route.");
assert(!exists("frontend/src/features/settings/leave/LeavePolicyRulesSettingsPage.tsx"), "standalone LeavePolicyRulesSettingsPage must not exist.");
assert(leaveSettings.includes("Open Leave Policy Rules"), "/settings/leave must expose Open Leave Policy Rules.");
assert(leaveSettings.includes("Leave Policy Rules"), "/settings/leave must clearly label Leave Policy Rules.");
assert(leaveSettings.includes("LeavePolicyRulesSettingsPanel"), "/settings/leave must embed the leave policy rules table/editor.");
assert(leaveSettings.includes("/settings/leave?section=policy-rules&highlight=leave-policy-rules"), "Open Leave Policy Rules must target /settings/leave with section/highlight query.");
assert(leavePolicyRulesSettings.includes("Leave Policy Rules"), "LeavePolicyRulesSettingsPanel must render Leave Policy Rules heading.");
assert(leavePolicyRulesSettings.includes("Edit Policy Rules"), "LeavePolicyRulesSettingsPanel must expose Edit Policy Rules row action.");
assert(leavePolicyRulesSettings.includes("LeavePolicyRuleDialog"), "LeavePolicyRulesSettingsPanel must use the existing LeavePolicyRuleDialog.");
assert(leaveTypesPanel.includes("Open Leave Policy Settings"), "Leave Types / Policies tab must link to Leave Policy Settings.");
assert(leaveTypesPanel.includes("/settings/leave?section=policy-rules&highlight=leave-policy-rules"), "Leave module must link to existing Leave settings policy section.");

for (const marker of [
  'featureKey="asset_tracking"',
  'featureKey="uniform_tracking"',
  'featureKey="roster"',
  'featureKey="contract_tracking"',
  'target: "asset-categories"',
  'target: "uniform-types"',
  'target: "shift-templates"',
  'target: "contract-renewal-approval"',
]) {
  assert(modulePages.includes(marker), `module settings pages missing ${marker}.`);
}
assert(modulePages.includes("data-setup-target={item.target}"), "module settings pages must render setup target data attributes.");
assert(modulePages.includes("StructuredSettingsPanel"), "module settings pages must render structured settings for interactable setup targets.");
assert(modulePages.includes("additionalSettingsPageDefinitions.assets"), "Asset settings page must render editable asset issue rules.");
assert(modulePages.includes("additionalSettingsPageDefinitions.uniforms"), "Uniform settings page must render editable uniform issue rules.");
assert(modulePages.includes('target: "asset-categories"'), "Asset categories setup target must remain on asset settings page.");
assert(modulePages.includes('target: "uniform-types"'), "Uniform types setup target must remain on uniform settings page.");

for (const marker of [
  "Employee Numbering",
  "employee-numbering",
  "Self-Service Settings",
  "self-service-settings",
  "Approval Workflows",
  "approval-workflows",
]) {
  assert(settingsPage.includes(marker) || assertFile("frontend/src/features/settings/structured-settings.ts").includes(marker), `All Settings must expose real ${marker} section.`);
}
assert(!settingsPage.includes("setupGuidance"), "All Settings must not keep fake setupGuidance cards.");

for (const [path, featureKey] of [
  ["frontend/src/features/settings/backup/BackupSettingsPage.tsx", "backup_recovery"],
  ["frontend/src/features/settings/notifications/NotificationsSettingsPage.tsx", "notifications"],
  ["frontend/src/features/settings/reports/ReportsSettingsPage.tsx", "reports"],
  ["frontend/src/features/settings/import-export/ImportExportSettingsPage.tsx", "import_export"],
  ["frontend/src/features/settings/devices-sync/DevicesSyncSettingsPage.tsx", "offline_sync"],
]) {
  const source = assertFile(path);
  assert(source.includes("ModuleAvailabilityPanel"), `${path} must show ModuleAvailabilityPanel or an explicit availability explanation.`);
  assert(source.includes(`featureKey="${featureKey}"`), `${path} must use featureKey="${featureKey}".`);
}

assert(settingsPage.includes("Review setup-critical settings and open a module settings page to configure availability, effective date, and detailed module options."), "All Settings page must explain module pages own availability/effective-date configuration.");
for (const label of ["Asset Tracking", "Uniform Tracking", "Duty Roster", "Contract Tracking"]) {
  assert(settingsPage.includes(label), `All Settings page missing ${label} settings link.`);
}

for (const marker of [
  'requiredAttendanceSubFeature: "corrections_enabled"',
  'requiredAttendanceSubFeature: "kiosk_enabled"',
  'requiredAttendanceSubFeature: "biometric_enabled"',
]) {
  assert(router.includes(marker), `router missing ${marker}.`);
  assert(navigation.includes(marker), `navigation missing ${marker}.`);
}

assert(navigation.includes('label: "My Documents"'), "navigation must expose My Documents separately.");
assert(navigation.includes('label: "My KYC Requests"'), "navigation must expose My KYC Requests separately.");
assert(!navigation.includes('label: "My Documents / KYC"'), "navigation must not expose combined My Documents / KYC link.");
assert(navigation.includes('label: "My Documents", path: "/self/documents", icon: FileText, moduleCode: "document_tracking", requiredFeature: "documents"'), "My Documents must require Document Tracking and documents.");
assert(navigation.includes('label: "Documents", path: "/documents", icon: FileText, moduleCode: "document_tracking", requiredFeature: "documents"'), "Admin Documents must require Document Tracking and documents.");
assert(navigation.includes('label: "My KYC Requests"') && navigation.includes('requiredFeature: "kyc_update_requests"'), "My KYC Requests must require kyc_update_requests.");
assert(router.includes('path="/self/documents"') && router.includes('moduleCode: "document_tracking"'), "self documents route must require document_tracking.");
assert(router.includes('path="/documents"') && router.includes('moduleCode: "document_tracking"'), "documents route must require document_tracking.");
assert(router.includes('moduleCode: "documents_kyc"'), "KYC route must retain documents_kyc module alias guard.");
assert(router.includes('requiredFeature: "kyc_update_requests"') || router.includes('feature: "kyc_update_requests"'), "KYC route must guard against kyc_update_requests.");

assert(!validators.includes("input.effective_from !== undefined ? false : false"), "feature effective-date validator must not be a no-op.");
assert(validators.includes("feature availability change requires an effective date"), "feature validator must enforce effective dates for availability changes.");
assert(setupGuideService.includes("settingsService.updateFeature"), "setup guide module choice must update real feature settings.");
assert(setupGuideService.includes("effective_from"), "setup guide module choice must pass an effective_from date.");
assert(setupGuideRegistry.includes("module-status-overview"), "setup guide must point module review to Module Status Overview.");
assert(!setupGuideRegistry.includes("highlight=feature-controls"), "setup guide must not point to removed global Feature Controls target.");
for (const marker of [
  "/settings?section=numbering",
  "/settings?section=employee-access",
  "/settings?section=workflows",
  "/settings/assets?section=issue-rules",
  "/settings/uniforms?section=issue-rules",
  "/settings/leave?section=policy-rules",
  "/settings/leave?section=document-rules",
  "/settings/leave?section=deduction-rules",
]) {
  assert(setupGuideRegistry.includes(marker), `setup guide target must route to existing settings section: ${marker}.`);
}

const walk = (dir) =>
  readdirSync(resolve(root, dir)).flatMap((entry) => {
    const relative = `${dir}/${entry}`;
    const absolute = resolve(root, relative);
    if (statSync(absolute).isDirectory()) return walk(relative);
    return relative;
  });

const frontendFiles = walk("frontend/src").filter((file) => /\.(tsx?|jsx?)$/.test(file));
const allowedNativeDateFiles = new Set([
  "frontend/src/components/forms/AppDatePicker.tsx",
  "frontend/src/components/forms/AppMonthPicker.tsx",
]);
for (const file of frontendFiles) {
  const source = assertFile(file);
  const hasNative = /type=["'](?:date|month)["']/.test(source);
  assert(!hasNative || allowedNativeDateFiles.has(file), `${file} must use shared date picker components instead of raw native date/month inputs.`);
}

if (failures.length) {
  console.error("Settings/navigation UX verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Settings/navigation UX verification passed.");
