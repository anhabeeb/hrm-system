import { existsSync, readFileSync } from "node:fs";

const fail = (messages) => {
  console.error("Dashboard personalization verification failed:");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
};

const read = (path) => readFileSync(path, "utf8");

const requiredFiles = [
  "migrations/0078_dashboard_personalization_preferences.sql",
  "src/modules/dashboard-preferences/dashboard-preferences.types.ts",
  "src/modules/dashboard-preferences/dashboard-preferences.repository.ts",
  "src/modules/dashboard-preferences/dashboard-preferences.service.ts",
  "src/modules/dashboard-preferences/dashboard-preferences.controller.ts",
  "frontend/src/config/dashboardWidgets.ts",
  "frontend/src/features/dashboard-personalization/dashboardPreferences.api.ts",
  "frontend/src/features/dashboard-personalization/dashboardPreferences.types.ts",
  "frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts",
  "frontend/src/features/dashboard-personalization/DashboardCustomizeButton.tsx",
  "frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx",
  "frontend/src/features/dashboard-personalization/DashboardWidgetListEditor.tsx",
  "frontend/src/features/dashboard-personalization/DashboardWidgetVisibilityToggle.tsx",
  "frontend/src/features/dashboard-personalization/DashboardWidgetOrderControls.tsx",
  "frontend/src/features/dashboard-personalization/DashboardResetLayoutButton.tsx",
  "tests/dashboard-personalization.test.ts",
];

const errors = [];
for (const file of requiredFiles) {
  if (!existsSync(file)) errors.push(`${file} is missing`);
}
if (errors.length) fail(errors);

const migration = read("migrations/0078_dashboard_personalization_preferences.sql");
const routes = read("src/routes/dashboard.routes.ts");
const service = read("src/modules/dashboard-preferences/dashboard-preferences.service.ts");
const repository = read("src/modules/dashboard-preferences/dashboard-preferences.repository.ts");
const registry = read("frontend/src/config/dashboardWidgets.ts");
const api = read("frontend/src/features/dashboard-personalization/dashboardPreferences.api.ts");
const utils = read("frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts");
const dialog = read("frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx");
const orderControls = read("frontend/src/features/dashboard-personalization/DashboardWidgetOrderControls.tsx");
const resetButton = read("frontend/src/features/dashboard-personalization/DashboardResetLayoutButton.tsx");
const adminPage = read("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");
const selfPage = read("frontend/src/features/self-service/EmployeeDashboardPage.tsx");
const tests = read("tests/dashboard-personalization.test.ts");

const checks = [
  [migration.includes("CREATE TABLE IF NOT EXISTS dashboard_user_preferences"), "dashboard_user_preferences migration/table is missing"],
  [migration.includes("layout_json TEXT NOT NULL") && migration.includes("UNIQUE(company_id, user_id, dashboard_type)"), "preference migration must store layout JSON with per-user uniqueness"],
  [routes.includes("/preferences/:dashboardType") && routes.includes("preferencesController.savePreference") && routes.includes("preferencesController.resetPreference"), "dashboard preference API routes are missing"],
  [service.includes("sanitizeLayout") && service.includes("MAX_LAYOUT_JSON_BYTES") && service.includes("containsSensitiveKey"), "preference service must validate size/shape and reject sensitive keys"],
  [service.includes("requireSelfServiceEmployee") && service.includes("SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED"), "self-service dashboard preferences must require a linked employee"],
  [repository.includes("ON CONFLICT(company_id, user_id, dashboard_type)") && repository.includes("findLinkedEmployeeId"), "repository must upsert own preference and support linked employee lookup"],
  [api.includes("api.put<DashboardPreference>") && api.includes("useDashboardPreferences") && api.includes("useResetDashboardPreferences"), "frontend preference API/hooks are incomplete"],
  [registry.includes("adminCommandCenterWidgetDefinitions") && registry.includes("selfServiceWidgetDefinitions"), "dashboard widget registry must include admin and self-service definitions"],
  [registry.includes("requiresLinkedEmployee: true") && registry.includes("requiredPermissionsAny") && registry.includes("requiredFeaturesAll"), "widget registry must include linked employee, permission, and multi-module metadata"],
  [utils.includes("canShowModuleItem") && utils.includes("getAllowedDashboardWidgets") && utils.includes("mergeDashboardPreferences"), "personalization helper must apply module/permission filtering after preferences"],
  [utils.includes("savedById") && utils.includes("visibleDashboardWidgets"), "invalid saved widget ids must be ignored through registry-based merging"],
  [dialog.includes("DashboardWidgetListEditor") && dialog.includes("toast.success") && dialog.includes("toast.error"), "customize dialog must support editing and non-blocking toast feedback"],
  [orderControls.includes("Move widget up") && orderControls.includes("Move widget down"), "widget order controls are missing"],
  [resetButton.includes("Reset to default"), "reset layout button is missing"],
  [adminPage.includes('usePersonalizedWidgets("ADMIN_COMMAND_CENTER"') && adminPage.includes("DashboardCustomizeButton") && adminPage.includes("personalization.visibleWidgets.map"), "Admin Command Center does not use personalization"],
  [selfPage.includes('usePersonalizedWidgets("SELF_SERVICE_DASHBOARD"') && selfPage.includes("DashboardCustomizeButton") && selfPage.includes("LinkedEmployeeOnlyGuard"), "Self-Service Dashboard does not use personalization safely"],
  [tests.includes("disabled module widget not shown") || tests.includes("filters widgets by module permission"), "tests for permission/module filtering are missing"],
  [tests.includes("invalid") || tests.includes("invalid widget id") || tests.includes("invalid saved widget"), "tests for invalid/corrupt layout recovery are missing"],
];

for (const [ok, message] of checks) {
  if (!ok) errors.push(message);
}

const scanned = [
  registry,
  api,
  utils,
  dialog,
  orderControls,
  resetButton,
  adminPage,
  selfPage,
].join("\n");

if (/\balert\s*\(/.test(scanned)) errors.push("Browser alert() usage introduced in dashboard personalization");
if (/\bconfirm\s*\(/.test(scanned)) errors.push("Browser confirm() usage introduced in dashboard personalization");
if (/dark:|darkMode|ThemeProvider/.test(scanned)) errors.push("Dark mode implementation appears in dashboard personalization");
if (/employee_name|payroll_amount|document_file_key|disciplinary_note/i.test(registry)) {
  errors.push("Widget registry appears to store sensitive widget data instead of metadata");
}

if (errors.length) fail(errors);

console.log("Dashboard personalization verification passed.");
