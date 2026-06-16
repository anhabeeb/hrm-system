import { existsSync, readFileSync } from "node:fs";

const fail = (messages) => {
  console.error("Sidebar navigation modernization verification failed:");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
};

const read = (path) => readFileSync(path, "utf8");
const missing = [];
const requiredFiles = [
  "frontend/src/config/navigation.ts",
  "frontend/src/lib/navigationAccess.ts",
  "frontend/src/components/layout/Sidebar.tsx",
  "frontend/src/components/layout/SidebarNavGroup.tsx",
  "frontend/src/components/layout/SidebarNavItem.tsx",
  "frontend/src/components/layout/SidebarBadge.tsx",
  "frontend/src/components/layout/SidebarSearch.tsx",
  "frontend/src/components/layout/SidebarCollapseButton.tsx",
  "frontend/src/components/layout/MobileSidebar.tsx",
  "frontend/src/hooks/useNavigationBadges.ts",
  "frontend/src/features/navigation/navigation.api.ts",
  "src/routes/navigation.routes.ts",
  "src/modules/navigation/navigation.service.ts",
  "tests/sidebar-navigation-modernization.test.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) missing.push(`${file} is missing`);
}
if (missing.length) fail(missing);

const navigation = read("frontend/src/lib/navigation.ts");
const access = read("frontend/src/lib/navigationAccess.ts");
const sidebar = read("frontend/src/components/layout/Sidebar.tsx");
const navItem = read("frontend/src/components/layout/SidebarNavItem.tsx");
const navGroup = read("frontend/src/components/layout/SidebarNavGroup.tsx");
const mobile = read("frontend/src/components/layout/MobileSidebar.tsx");
const badge = read("frontend/src/components/layout/SidebarBadge.tsx");
const hook = read("frontend/src/hooks/useNavigationBadges.ts");
const router = read("frontend/src/app/router.tsx");
const backend = read("src/modules/navigation/navigation.service.ts");
const topbar = read("frontend/src/components/layout/Topbar.tsx");
const tests = read("tests/sidebar-navigation-modernization.test.ts");

const checks = [
  [navigation.includes('id: "payroll-attendance-review"') && navigation.includes('requiredFeaturesAll: ["payroll", "attendance"]'), "Payroll Attendance Review must require Payroll + Attendance"],
  [navigation.includes('id: "department-dashboard"') && navigation.includes('requiredFeaturesAll: ["employee_management", "attendance"]'), "Department Dashboard must require Employee Management + Attendance"],
  [navigation.includes('id: "roster-weekly-matrix"') && navigation.includes('requiredFeaturesAll: ["roster", "employee_management"]'), "Roster Weekly Matrix must require Roster + Employee Management"],
  [navigation.includes("requiresLinkedEmployee: true") && navigation.includes("selfServiceOnly: true"), "Self-service navigation must require linked employee"],
  [access.includes("canShowModuleItem") && access.includes("searchNavigation") && access.includes("isNavigationItemActive"), "Navigation access/search/active helpers are incomplete"],
  [sidebar.includes("SidebarSearch") && sidebar.includes("SidebarNavGroup") && sidebar.includes("useNavigationBadges"), "Desktop sidebar must use search, groups, and badge hook"],
  [access.includes("getActiveNavigationItem") && access.includes("b.path.length - a.path.length"), "Active-route logic must use longest matching path, not simple prefix-only selection"],
  [sidebar.includes("getActiveNavigationItem(groups, location.pathname)") && navGroup.includes("active={activePath === item.path}"), "Sidebar must pass a single active item path to nav rows"],
  [mobile.includes("SheetContent") && mobile.includes("searchNavigation(groups, query)") && mobile.includes("<Sheet open={open} onOpenChange={setOpen}>") && mobile.includes("onNavigate={() => setOpen(false)}"), "Mobile sidebar drawer/search or close-on-navigation behavior is missing"],
  [navItem.includes("Tooltip") && navItem.includes("onClick={onNavigate}"), "Collapsed tooltip or navigation click handler missing"],
  [badge.includes("value === 0") && hook.includes("query.data?.data?.badges ?? {}"), "Badge logic must omit fake zero counts and fail soft"],
  [backend.includes("SUPPORTED_NAVIGATION_BADGE_KEYS") && backend.includes("settingsService.isFeatureEnabled") && backend.includes("resolveModuleFeatureAliases"), "Backend badge service must use supported keys and module-enabled checks"],
  [backend.includes("findActorLinkedEmployee") && backend.includes("employeeScopeClause") && backend.includes("approval_request_steps"), "Backend badge service must use linked employee/row-level approval visibility helpers"],
  [backend.includes("maybeCount") && backend.includes("count > 0 ? count : undefined"), "Backend badge service must omit unavailable/zero counts instead of faking badges"],
  [router.includes('featuresAll: ["payroll", "attendance"]') && router.includes("requiresLinkedEmployee: true"), "Route guard alignment for multi-module/self-service routes missing"],
  [tests.includes("standalone") || tests.includes("self-service navigation linked-employee-only"), "Standalone/self-service hiding tests are missing"],
  [tests.includes("disabled") || tests.includes("multi-module dependencies"), "Disabled/multi-module navigation tests are missing"],
  [tests.includes("scopes navigation badges") && tests.includes("longest-match active route") && tests.includes("closes mobile sidebar"), "Badge scoping, active-route, or mobile-close tests are missing"],
];

const errors = checks.filter(([ok]) => !ok).map(([, message]) => message);

const scanFiles = [
  "frontend/src/components/layout/Sidebar.tsx",
  "frontend/src/components/layout/SidebarNavItem.tsx",
  "frontend/src/components/layout/MobileSidebar.tsx",
  "frontend/src/lib/navigation.ts",
].map(read).join("\n");
const unsupportedBadgeKeys = ["notifications", "operationOwnershipWarnings", "payrollBlockers"];
for (const key of unsupportedBadgeKeys) {
  if (navigation.includes(`badgeKey: "${key}"`)) {
    errors.push(`Unsupported badge key ${key} is still wired in navigation without scoped backend support`);
  }
}
if (/FROM approval_requests WHERE company_id = \?/.test(backend) || /FROM attendance_corrections WHERE company_id = \?/.test(backend) || /FROM roster_change_requests WHERE company_id = \?/.test(backend) || /FROM expiry_alerts WHERE company_id = \?/.test(backend)) {
  errors.push("Navigation badge service still appears to use raw company-wide badge counts");
}
if (topbar.includes("Search placeholder")) errors.push("Topbar still contains the Search placeholder text");
if (/\balert\s*\(/.test(scanFiles)) errors.push("Browser alert() usage introduced in navigation files");
if (/\bconfirm\s*\(/.test(scanFiles)) errors.push("Browser confirm() usage introduced in navigation files");
if (/dark:|darkMode|ThemeProvider/.test(scanFiles)) errors.push("Dark mode implementation appears in navigation files");

if (errors.length) fail(errors);

console.log("Sidebar navigation modernization verification passed.");
