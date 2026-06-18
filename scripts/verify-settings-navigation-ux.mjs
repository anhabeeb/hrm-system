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
const featurePanel = assertFile("frontend/src/features/settings/FeatureSettingsPanel.tsx");
const featureDialog = assertFile("frontend/src/features/settings/FeatureReasonDialog.tsx");
const structuredPanel = assertFile("frontend/src/features/settings/StructuredSettingsPanel.tsx");
const moduleMetadata = assertFile("frontend/src/features/settings/module-feature-metadata.ts");
const modulePages = assertFile("frontend/src/features/settings/module/ModuleSettingsPages.tsx");
const settingsPage = assertFile("frontend/src/features/settings/SettingsPage.tsx");
const settingsApi = assertFile("frontend/src/features/settings/settings.api.ts");
const router = assertFile("frontend/src/app/router.tsx");
const navigation = assertFile("frontend/src/lib/navigation.ts");
const setupGuideService = assertFile("src/modules/setup-guide/setup-guide.service.ts");
const validators = assertFile("src/modules/settings/settings.validators.ts");

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
  assert(moduleAvailability.includes(marker) || featurePanel.includes(marker), `feature availability flow missing ${marker}.`);
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

for (const path of ["/settings/assets", "/settings/uniforms", "/settings/roster", "/settings/contracts"]) {
  assert(router.includes(`path="${path}"`) || router.includes(`path=\\"${path}\\"`), `router missing ${path}.`);
  assert(navigation.includes(`path: "${path}"`), `navigation missing ${path}.`);
}

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

assert(settingsPage.includes("Open a module settings page to configure availability, effective date, and detailed options."), "All Settings page must explain module pages own availability/effective-date configuration.");
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
assert(router.includes('moduleCode: "documents_kyc"'), "KYC route must retain documents_kyc module alias guard.");
assert(router.includes('requiredFeature: "kyc_update_requests"') || router.includes('feature: "kyc_update_requests"'), "KYC route must guard against kyc_update_requests.");

assert(!validators.includes("input.effective_from !== undefined ? false : false"), "feature effective-date validator must not be a no-op.");
assert(validators.includes("feature availability change requires an effective date"), "feature validator must enforce effective dates for availability changes.");
assert(setupGuideService.includes("settingsService.updateFeature"), "setup guide module choice must update real feature settings.");
assert(setupGuideService.includes("effective_from"), "setup guide module choice must pass an effective_from date.");

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
