import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const failures = [];
const file = (path) => resolve(root, path);
const read = (path) => readFileSync(file(path), "utf8");
const readIfExists = (path) => existsSync(file(path)) ? read(path) : "";
const mustExist = (path) => {
  if (!existsSync(file(path))) failures.push(`${path} is missing.`);
};
const mustInclude = (label, text, token) => {
  if (!text.includes(token)) failures.push(`${label} missing ${token}`);
};

const walk = (dir) => {
  const absolute = file(dir);
  if (!existsSync(absolute)) return [];
  const result = [];
  for (const entry of readdirSync(absolute)) {
    const full = join(absolute, entry);
    const relative = full.slice(root.length + 1).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry)) result.push(...walk(relative));
    } else {
      result.push(relative);
    }
  }
  return result;
};

[
  "frontend/src/components/widgets/WidgetCard.tsx",
  "frontend/src/components/widgets/MetricTile.tsx",
  "frontend/src/components/widgets/StatusStrip.tsx",
  "frontend/src/components/widgets/ActionQueueWidget.tsx",
  "frontend/src/components/widgets/DashboardGrid.tsx",
  "frontend/src/components/widgets/ModuleHealthCard.tsx",
  "frontend/src/components/widgets/TimelineWidget.tsx",
  "frontend/src/components/widgets/MiniCalendarWidget.tsx",
  "frontend/src/components/widgets/WidgetSkeleton.tsx",
  "frontend/src/components/access/ModuleDisabledGuard.tsx",
  "frontend/src/components/access/LinkedEmployeeOnlyGuard.tsx",
  "frontend/src/components/access/ModuleDisabledPage.tsx",
  "frontend/src/components/access/PermissionAwareNavItem.tsx",
  "frontend/src/config/moduleCodes.ts",
  "frontend/src/lib/moduleAccess.ts",
  "frontend/src/hooks/useModuleAccess.ts",
  "tests/ui-foundation-modernization.test.ts",
  "tests/module-enabled-visibility.test.ts",
].forEach(mustExist);

const moduleAccess = readIfExists("frontend/src/lib/moduleAccess.ts");
const moduleCodes = readIfExists("frontend/src/config/moduleCodes.ts");
const navigation = readIfExists("frontend/src/lib/navigation.ts");
const guards = readIfExists("frontend/src/features/auth/route-guards.tsx");
const disabledPage = readIfExists("frontend/src/components/access/ModuleDisabledPage.tsx");
const linkedGuard = readIfExists("frontend/src/components/access/LinkedEmployeeOnlyGuard.tsx");
const widgetCard = readIfExists("frontend/src/components/widgets/WidgetCard.tsx");
const metricTile = readIfExists("frontend/src/components/widgets/MetricTile.tsx");
const tests = `${readIfExists("tests/ui-foundation-modernization.test.ts")}\n${readIfExists("tests/module-enabled-visibility.test.ts")}\n${readIfExists("tests/employee-self-service-dashboard.test.ts")}`;

[
  "isModuleEnabled",
  "hasRequiredPermission",
  "requiresLinkedEmployee",
  "canShowModuleItem",
  "canAccessSelfService",
  "canAccessModuleRoute",
].forEach((token) => mustInclude("module access helper", moduleAccess, token));

[
  "employees",
  "attendance",
  "leave",
  "payroll",
  "documents_kyc",
  "resignation_offboarding",
  "disciplinary_actions",
].forEach((token) => mustInclude("module code config", moduleCodes, token));

[
  "moduleCode",
  "requiredPermission",
  "requiresLinkedEmployee",
  "canShowModuleItem",
  "Self-Service",
].forEach((token) => mustInclude("navigation config", navigation, token));

[
  "ModuleDisabledPage",
  "LinkedEmployeeOnlyGuard",
  "isRouteFeatureAllowed(user, { moduleCode, requiredFeature, moduleCodesAll, requiredFeaturesAll })",
  "requiresLinkedEmployee && !user?.employee_id",
].forEach((token) => mustInclude("route guards", guards, token));

mustInclude("module disabled page", disabledPage, "This module is currently disabled.");
mustInclude("linked employee guard", linkedGuard, "Self-service is only available for accounts linked to an employee profile.");
mustInclude("widget card", widgetCard, "WidgetSkeleton");
mustInclude("metric tile", metricTile, "neutral");
mustInclude("metric tile", metricTile, "success");
mustInclude("metric tile", metricTile, "warning");
mustInclude("metric tile", metricTile, "danger");
mustInclude("metric tile", metricTile, "info");

[
  "disabled Leave module hides Leave sidebar links",
  "standalone Super Admin does not see self-service nav links",
  "disabled module route shows ModuleDisabled page",
  "WidgetCard exists",
].forEach((token) => mustInclude("ui foundation tests", tests, token));

const frontendSource = walk("frontend/src")
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .map((path) => read(path))
  .join("\n");
if (/\b(?:window\.)?alert\s*\(/.test(frontendSource)) failures.push("browser alert() usage exists in frontend/src.");
if (/\b(?:window\.)?confirm\s*\(/.test(frontendSource)) failures.push("browser confirm() usage exists in frontend/src.");
if (/\bdarkMode\b/.test(frontendSource) || /\bdark:[\w-]/.test(frontendSource)) failures.push("dark mode marker exists in frontend/src.");

if (failures.length > 0) {
  console.error("UI foundation modernization verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI foundation modernization verification passed.");
