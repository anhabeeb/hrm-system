import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Sidebar / Navigation Modernization", () => {
  it("uses centralized navigation config and access helpers", () => {
    expect(read("frontend/src/config/navigation.ts")).toContain("navigationGroups");
    expect(read("frontend/src/lib/navigationAccess.ts")).toContain("canAccessNavItem");
    expect(read("frontend/src/lib/navigationAccess.ts")).toContain("searchNavigation");
    expect(read("frontend/src/components/layout/Sidebar.tsx")).toContain("@/config/navigation");
    expect(read("frontend/src/components/layout/Topbar.tsx")).toContain("MobileSidebar");
  });

  it("supports grouped, collapsible, searchable navigation", () => {
    expect(read("frontend/src/components/layout/SidebarNavGroup.tsx")).toContain("data-nav-group");
    expect(read("frontend/src/components/layout/SidebarCollapseButton.tsx")).toContain("Collapse sidebar");
    expect(read("frontend/src/components/layout/SidebarSearch.tsx")).toContain("Search visible navigation");
    expect(read("frontend/src/components/layout/MobileSidebar.tsx")).toContain("searchNavigation(groups, query)");
  });

  it("keeps key multi-module dependencies in the navigation registry", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    expect(navigation).toContain('id: "payroll-attendance-review"');
    expect(navigation).toContain('requiredFeaturesAll: ["payroll", "attendance"]');
    expect(navigation).toContain('id: "department-dashboard"');
    expect(navigation).toContain('requiredFeaturesAll: ["employee_management", "attendance"]');
    expect(navigation).toContain('id: "roster-weekly-matrix"');
    expect(navigation).toContain('requiredFeaturesAll: ["roster", "employee_management"]');
  });

  it("keeps self-service navigation linked-employee-only", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    expect(navigation).toContain('id: "self-dashboard"');
    expect(navigation).toContain("requiresLinkedEmployee: true");
    expect(navigation).toContain("selfServiceOnly: true");
    expect(read("frontend/src/lib/navigationAccess.ts")).toContain("item.selfServiceOnly && !user?.employee_id");
  });

  it("adds safe badge plumbing without fake count rendering", () => {
    expect(read("frontend/src/components/layout/SidebarBadge.tsx")).toContain("value === 0");
    expect(read("frontend/src/hooks/useNavigationBadges.ts")).toContain("query.data?.data?.badges ?? {}");
    expect(read("frontend/src/features/navigation/navigation.api.ts")).toContain("/navigation/badges");
    expect(read("src/modules/navigation/navigation.service.ts")).toContain("count > 0 ? count : undefined");
  });

  it("scopes navigation badges by module, permission, and employee visibility", () => {
    const service = read("src/modules/navigation/navigation.service.ts");
    expect(service).toContain("SUPPORTED_NAVIGATION_BADGE_KEYS");
    expect(service).toContain("settingsService.isFeatureEnabled");
    expect(service).toContain("resolveModuleFeatureAliases");
    expect(service).toContain("findActorLinkedEmployee");
    expect(service).toContain("employeeScopeClause");
    expect(service).toContain("approval_request_steps");
    expect(service).toContain("assigned_approver_user_id");
    expect(service).toContain("required_min_level");
    expect(service).not.toContain("FROM approval_requests WHERE company_id = ?");
    expect(service).not.toContain("FROM attendance_corrections WHERE company_id = ?");
    expect(service).not.toContain("FROM roster_change_requests WHERE company_id = ?");
    expect(service).not.toContain("FROM expiry_alerts WHERE company_id = ?");
  });

  it("does not keep unsupported sidebar badge keys wired to navigation", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const frontendTypes = read("frontend/src/types/navigation.ts");
    const backendTypes = read("src/modules/navigation/navigation.types.ts");
    expect(navigation).not.toContain('badgeKey: "notifications"');
    expect(navigation).not.toContain('badgeKey: "operationOwnershipWarnings"');
    expect(navigation).not.toContain('badgeKey: "payrollBlockers"');
    expect(frontendTypes).toContain('"approvals" | "attendanceCorrections" | "rosterChanges" | "documentExpiry"');
    expect(backendTypes).not.toContain('"payrollBlockers"');
  });

  it("registers an authenticated navigation badge endpoint", () => {
    expect(read("src/routes/navigation.routes.ts")).toContain("authMiddleware");
    expect(read("src/routes/navigation.routes.ts")).toContain('"/badges"');
    expect(read("src/routes/navigation.routes.ts")).toContain("requireAnyPermission");
    expect(read("src/app.ts")).toContain('apiV1.route("/navigation", navigationRoutes)');
  });

  it("keeps route guards aligned for key routes", () => {
    const router = read("frontend/src/app/router.tsx");
    expect(router).toContain('featuresAll: ["payroll", "attendance"]');
    expect(router).toContain('featuresAll: ["employee_management", "attendance"]');
    expect(router).toContain('moduleCodesAll: ["roster", "employees"]');
    expect(router).toContain("requiresLinkedEmployee: true");
  });

  it("uses longest-match active route selection", () => {
    const access = read("frontend/src/lib/navigationAccess.ts");
    const sidebar = read("frontend/src/components/layout/Sidebar.tsx");
    const mobile = read("frontend/src/components/layout/MobileSidebar.tsx");
    expect(access).toContain("getActiveNavigationItem");
    expect(access).toContain(".sort((a, b) => b.path.length - a.path.length)");
    expect(sidebar).toContain("const activePath = getActiveNavigationItem(groups, location.pathname)?.path ?? null");
    expect(mobile).toContain("const activePath = getActiveNavigationItem(groups, location.pathname)?.path ?? null");
    expect(read("frontend/src/components/layout/SidebarNavGroup.tsx")).toContain("active={activePath === item.path}");
  });

  it("closes mobile sidebar after route selection and removes placeholder search", () => {
    const mobile = read("frontend/src/components/layout/MobileSidebar.tsx");
    expect(mobile).toContain("const [open, setOpen] = useState(false)");
    expect(mobile).toContain("<Sheet open={open} onOpenChange={setOpen}>");
    expect(mobile).toContain("onNavigate={() => setOpen(false)}");
    expect(read("frontend/src/components/layout/Topbar.tsx")).not.toContain("Search placeholder");
  });

  it("does not introduce browser dialogs or dark mode", () => {
    const files = [
      "frontend/src/components/layout/Sidebar.tsx",
      "frontend/src/components/layout/SidebarNavItem.tsx",
      "frontend/src/components/layout/MobileSidebar.tsx",
      "frontend/src/lib/navigation.ts",
    ].map(read).join("\n");
    expect(files).not.toMatch(/\balert\s*\(/);
    expect(files).not.toMatch(/\bconfirm\s*\(/);
    expect(files).not.toMatch(/dark:/);
  });
});
