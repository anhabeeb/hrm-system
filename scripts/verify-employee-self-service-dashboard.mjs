import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustExist = (path) => {
  if (!existsSync(resolve(root, path))) failures.push(`${path} is missing.`);
};
const mustInclude = (label, text, token) => {
  if (!text.includes(token)) failures.push(`${label} missing ${token}`);
};

[
  "src/routes/self-service.routes.ts",
  "src/modules/self-service/self-service.service.ts",
  "src/modules/self-service/self-service.repository.ts",
  "src/modules/self-service/self-service.controller.ts",
  "frontend/src/features/self-service/EmployeeDashboardPage.tsx",
  "frontend/src/features/self-service/MyProfilePage.tsx",
  "frontend/src/features/self-service/MyRequestsPage.tsx",
  "frontend/src/features/self-service/MyPendingApprovalsPage.tsx",
  "frontend/src/lib/default-landing.ts",
  "tests/employee-self-service-dashboard.test.ts",
].forEach(mustExist);

const app = read("src/app.ts");
const routes = read("src/routes/self-service.routes.ts");
const service = read("src/modules/self-service/self-service.service.ts");
const repository = read("src/modules/self-service/self-service.repository.ts");
const router = read("frontend/src/app/router.tsx");
const navigation = read("frontend/src/lib/navigation.ts");
const landing = read("frontend/src/lib/default-landing.ts");
const login = read("frontend/src/features/auth/LoginPage.tsx");
const twoFactor = read("frontend/src/features/auth/TwoFactorPage.tsx");
const routeGuards = read("frontend/src/features/auth/route-guards.tsx");
const permissionDenied = read("frontend/src/components/feedback/PermissionDenied.tsx");
const shared = read("frontend/src/features/self-service/SelfServiceShared.tsx");
const dashboard = read("frontend/src/features/self-service/EmployeeDashboardPage.tsx");
const profile = read("frontend/src/features/self-service/MyProfilePage.tsx");
const requests = read("frontend/src/features/self-service/MyRequestsPage.tsx");
const permissions = read("seeds/permissions.seed.sql");
const tests = read("tests/employee-self-service-dashboard.test.ts");

mustInclude("app routes", app, 'apiV1.route("/self", selfServiceRoutes)');
[
  'selfServiceRoutes.get("/dashboard"',
  'selfServiceRoutes.get("/profile"',
  'selfServiceRoutes.get("/requests"',
  'selfServiceRoutes.get("/pending-approvals"',
  'selfServiceRoutes.get("/navigation"',
  "authMiddleware",
  "self.dashboard.view",
].forEach((token) => mustInclude("self routes", routes, token));

[
  "getSelfDashboard",
  "getSelfProfile",
  "getSelfNavigation",
  "getSelfAccessSummary",
  "getSelfRequests",
  "getSelfPendingApprovals",
  "resolveEmployeeNavigation",
  "canViewAttendance",
  "canViewRoster",
  "canViewLeave",
  "canViewDocuments",
  "canViewPayslips",
  "You do not have access to this module.",
  "password|token|secret|session",
].forEach((token) => mustInclude("self service", service, token));

[
  "getDefaultLandingPath",
  "dashboard.view_company",
  "self.dashboard.view",
  "notifications.manage_own",
  "getVisibleNavigation",
].forEach((token) => mustInclude("default landing helper", landing, token));

[
  "getDefaultLandingPath(result.user)",
].forEach((token) => mustInclude("login landing", login, token));
if (/navigate\(\s*["']\/dashboard["']/.test(login)) failures.push("LoginPage must not navigate every user to /dashboard.");

[
  "getDefaultLandingPath(user)",
].forEach((token) => mustInclude("2FA landing", twoFactor, token));
if (/navigate\(\s*["']\/dashboard["']/.test(twoFactor)) failures.push("TwoFactorPage must not navigate every user to /dashboard.");

mustInclude("public route landing", routeGuards, "getDefaultLandingPath(user)");
if (/<Navigate\s+to=["']\/dashboard["']/.test(routeGuards)) failures.push("PublicRoute must not redirect every authenticated user to /dashboard.");

mustInclude("router landing", router, "DefaultLandingRedirect");
mustInclude("permission denied landing", permissionDenied, "getDefaultLandingPath(user)");
if (/<Link\s+to=["']\/dashboard["']/.test(permissionDenied)) failures.push("PermissionDenied back button must use the default landing helper.");

[
  "findSelfProfile",
  "listEnabledFeatureKeys",
  "feature_settings",
  "listSelfRequests",
  "listSelfPendingApprovals",
  "requester_employee_id",
  "subject_employee_id",
].forEach((token) => mustInclude("self repository", repository, token));
if (/SELECT\s+\*/i.test(repository)) failures.push("self repository must not use SELECT *.");
if (/password_hash|session_token|reset_token|totp_secret/i.test(repository)) {
  failures.push("self repository appears to select or expose sensitive auth fields.");
}

[
  "/self/dashboard",
  "/self/profile",
  "/self/requests",
  "/self/pending-approvals",
  "SelfServiceModulePage",
].forEach((token) => mustInclude("frontend router", router, token));

[
  "Self-Service",
  'label: "Dashboard", path: "/dashboard"',
  'requiredPermissionsAny: ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]',
  "Employee Dashboard",
  "My Profile",
  "My Requests",
  "My Pending Approvals",
  "self.dashboard.view",
  "department.dashboard.view",
].forEach((token) => mustInclude("frontend navigation", navigation, token));

[
  "self.dashboard.view",
  "self.profile.view",
  "self.requests.view",
  "self.accessSummary.view",
  "department.approvals.view",
].forEach((token) => mustInclude("permission seed", permissions, token));

[
  "normal employee dashboard includes self widgets",
  "linked employee sees own profile",
  "not linked",
  "module-disabled widgets",
  "created on behalf",
  "pending approvals",
  "does not fetch module widget data when self-service permissions are missing",
  "uses permission-aware landing",
  "admin dashboard navigation",
].forEach((token) => mustInclude("self-service tests", tests, token));

mustInclude("self-service empty state", shared, "No pending requests at the moment.");
if (/mercifully|workflow limbo/i.test(shared)) failures.push("Requests empty state must use professional text.");

const frontendSource = `${dashboard}\n${profile}\n${requests}\n${navigation}\n${router}\n${login}\n${twoFactor}\n${routeGuards}\n${permissionDenied}`;
if (/window\.alert\s*\(|\balert\s*\(/.test(frontendSource)) failures.push("self-service frontend reintroduced browser alert().");
if (/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource)) failures.push("self-service frontend reintroduced browser confirm().");

console.log("Employee self-service dashboard verification");
console.log("- checked backend /self routes, resolver, frontend pages, permissions, tests, and sensitive-field exclusions");
if (failures.length > 0) {
  console.error("Employee self-service dashboard verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Employee self-service dashboard verification passed.");
