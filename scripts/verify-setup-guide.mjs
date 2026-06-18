import { existsSync, readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`Setup guide verification failed: ${message}`);
  process.exit(1);
};
const assertFile = (file) => {
  if (!existsSync(path.join(root, file))) fail(`${file} is missing.`);
  return read(file);
};
const assertIncludes = (content, marker, message) => {
  if (!content.includes(marker)) fail(message);
};

const collectFiles = (dir, predicate, files = []) => {
  for (const entry of readdirSync(path.join(root, dir))) {
    const relative = path.join(dir, entry);
    const absolute = path.join(root, relative);
    if (statSync(absolute).isDirectory()) collectFiles(relative, predicate, files);
    else if (predicate(relative)) files.push(relative);
  }
  return files;
};

const migration = assertFile("migrations/0086_setup_guide.sql");
assertIncludes(migration, "setup_guide_progress", "setup_guide_progress table is missing.");
assertIncludes(migration, "setup_guide_activities", "setup_guide_activities table is missing.");
assertIncludes(migration, "setup_wizard_completed", "setup completion fields are missing.");
assertIncludes(migration, "activity_status", "activity status field is missing.");

const app = assertFile("src/app.ts");
assertIncludes(app, "setupGuideRoutes", "setup guide routes are not mounted.");
assertIncludes(app, 'apiV1.route("/setup-guide"', "setup guide API route prefix is missing.");

const routes = assertFile("src/routes/setup-guide.routes.ts");
for (const marker of [
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
  assertIncludes(routes, marker, `setup guide route ${marker} is missing.`);
}

const service = assertFile("src/modules/setup-guide/setup-guide.service.ts");
for (const marker of [
  "disabled_by_choice",
  "needs_setup_after_enable",
  "review_recommended",
  "MODULE_LIFECYCLE_METADATA",
  "settingsService.updateFeature",
  "createAuditLog",
  "setup_wizard_finished",
  "setup_wizard_skipped_for_now",
  "is_counted_required",
]) {
  assertIncludes(service, marker, `setup guide service marker ${marker} is missing.`);
}

const registry = assertFile("src/modules/setup-guide/setup-guide.registry.ts");
for (const marker of [
  "company_profile",
  "feature_modules",
  "feature-controls",
  "outlets",
  "leave_management",
  "long_leave_management",
  "attendance",
  "payroll",
  "document",
  "approval_workflows",
]) {
  assertIncludes(registry, marker, `setup activity registry marker ${marker} is missing.`);
}

const targetKeys = [...registry.matchAll(/highlight=([^"&]+)"/g)].map((match) => match[1]);
if (!targetKeys.length) fail("setup activity registry has no target_highlight_key markers.");

const frontendTargetSources = collectFiles("frontend/src", (file) => /\.(tsx|ts|css)$/.test(file))
  .map((file) => read(file))
  .join("\n");
for (const target of targetKeys) {
  if (!frontendTargetSources.includes(`data-setup-target="${target}"`) && !frontendTargetSources.includes(`"${target}"`)) {
    fail(`setup activity target ${target} has no matching frontend data-setup-target marker.`);
  }
}
for (const target of [
  "feature-controls",
  "feature-document-tracking",
  "feature-asset-tracking",
  "feature-uniform-tracking",
  "feature-leave-management",
  "feature-long-leave-management",
  "feature-duty-roster",
  "feature-contract-tracking",
  "feature-attendance-management",
  "feature-payroll-management",
  "company-profile",
  "outlets-list",
  "department-create-button",
  "departments-list",
  "position-create-button",
  "positions-list",
  "job-levels",
  "employee-numbering",
  "roles-permissions",
  "backup-settings",
  "documents-types",
  "contract-renewal-approval",
  "asset-categories",
  "asset-issue-rules",
  "uniform-types",
  "uniform-issue-rules",
  "payroll-subfeatures",
  "payroll-long-leave-deductions",
  "attendance-subfeatures",
  "shift-templates",
  "roster-approvals",
  "self-service-settings",
  "notification-alerts",
  "import-export-actions",
  "approval-workflows",
  "final-review",
]) {
  if (!frontendTargetSources.includes(target)) {
    fail(`required setup target ${target} is missing from frontend sources.`);
  }
}

const router = assertFile("frontend/src/app/router.tsx");
assertIncludes(router, "/setup-wizard", "frontend setup wizard route is missing.");

for (const file of [
  "frontend/src/features/setup-guide/SetupWizardPage.tsx",
  "frontend/src/features/setup-guide/SetupGuideSidebar.tsx",
  "frontend/src/features/setup-guide/SetupActivityList.tsx",
  "frontend/src/features/setup-guide/SetupStepPanel.tsx",
  "frontend/src/features/setup-guide/SetupGuideOverlay.tsx",
  "frontend/src/features/setup-guide/SetupProgressBanner.tsx",
  "frontend/src/features/setup-guide/SetupIncompleteDashboardBanner.tsx",
  "frontend/src/features/setup-guide/SetupGuideGate.tsx",
  "frontend/src/features/setup-guide/setup-guide.api.ts",
  "frontend/src/features/setup-guide/setup-guide.types.ts",
  "frontend/src/features/setup-guide/setupGuide.api.ts",
]) {
  assertFile(file);
}

const shell = assertFile("frontend/src/components/layout/AppShell.tsx");
assertIncludes(shell, "SetupGuideGate", "AppShell does not include setup redirect gate.");
assertIncludes(shell, "SetupGuideOverlay", "AppShell does not include setup coach mark overlay.");

const dashboard = assertFile("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");
assertIncludes(dashboard, "SetupIncompleteDashboardBanner", "dashboard setup reminder banner is missing.");

const settings = assertFile("frontend/src/features/settings/FeatureSettingsPanel.tsx") + assertFile("frontend/src/features/settings/StructuredSettingsPanel.tsx");
assertIncludes(settings, "data-setup-target", "setup target data attributes are missing from settings surfaces.");
assertIncludes(settings, 'data-setup-target="feature-controls"', "Feature Controls setup target is missing.");

const tests = assertFile("tests/setup-guide.test.ts");
for (const marker of [
  "highlight=",
  "feature_modules",
  "feature-controls",
  "disabled_by_choice",
  "needs_setup_after_enable",
  "settingsService.updateFeature",
  "Complete the remaining required setup steps",
  "setup-guide/status",
  "setup-guide/activities",
]) {
  assertIncludes(tests, marker, `setup guide test marker ${marker} is missing.`);
}

const frontendSources = [
  "frontend/src/features/setup-guide/SetupWizardPage.tsx",
  "frontend/src/features/setup-guide/SetupGuideOverlay.tsx",
  "frontend/src/features/setup-guide/SetupIncompleteDashboardBanner.tsx",
].map(read).join("\n");

if (/alert\s*\(|confirm\s*\(|dark:/i.test(frontendSources)) {
  fail("setup guide frontend includes alert/confirm or dark-mode markers.");
}

console.log("Setup guide verification passed.");
