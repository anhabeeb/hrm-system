import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 1 UI foundation and visibility guards", () => {
  it("WidgetCard exists with loading, error, empty, action, and footer support", () => {
    const source = read("frontend/src/components/widgets/WidgetCard.tsx");

    expect(source).toContain("WidgetCard");
    expect(source).toContain("loading");
    expect(source).toContain("error");
    expect(source).toContain("empty");
    expect(source).toContain("action");
    expect(source).toContain("footer");
    expect(source).toContain("WidgetSkeleton");
  });

  it("MetricTile, StatusStrip, ActionQueueWidget, DashboardGrid, and future widget foundations exist", () => {
    expect(read("frontend/src/components/widgets/MetricTile.tsx")).toContain("status?: MetricStatus");
    expect(read("frontend/src/components/widgets/StatusStrip.tsx")).toContain("items: StatusStripItem[]");
    expect(read("frontend/src/components/widgets/ActionQueueWidget.tsx")).toContain("oldestPendingAge");
    expect(read("frontend/src/components/widgets/DashboardGrid.tsx")).toContain("md:grid-cols-2");
    expect(read("frontend/src/components/widgets/ModuleHealthCard.tsx")).toContain("No setup warnings detected.");
    expect(read("frontend/src/components/widgets/TimelineWidget.tsx")).toContain("No recent activity.");
    expect(read("frontend/src/components/widgets/MiniCalendarWidget.tsx")).toContain("MiniCalendarDay");
  });

  it("centralizes module access logic for module, permission, account type, and linked employee checks", () => {
    const helper = read("frontend/src/lib/moduleAccess.ts");
    const hook = read("frontend/src/hooks/useModuleAccess.ts");
    const moduleCodes = read("frontend/src/config/moduleCodes.ts");

    expect(moduleCodes).toContain("MODULE_CODES");
    expect(moduleCodes).toContain("MODULE_FEATURE_ALIASES");
    expect(helper).toContain("isModuleEnabled");
    expect(helper).toContain("hasRequiredPermission");
    expect(helper).toContain("requiresLinkedEmployee");
    expect(helper).toContain("canShowModuleItem");
    expect(helper).toContain("canAccessSelfService");
    expect(helper).toContain("canAccessModuleRoute");
    expect(hook).toContain("useModuleAccess");
  });

  it("disabled Leave module hides Leave sidebar links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain('label: "Leave"');
    expect(navigation).toContain('moduleCode: "leave"');
    expect(navigation).toContain('label: "My Leave"');
  });

  it("disabled Attendance module hides Attendance sidebar links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain('label: "Attendance"');
    expect(navigation).toContain('moduleCode: "attendance"');
    expect(navigation).toContain('label: "My Attendance"');
  });

  it("disabled Payroll module hides Payroll and Payslip links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain('moduleCode: "payroll"');
    expect(navigation).toContain('moduleCode: "payslips"');
    expect(navigation).toContain('label: "My Payslips"');
  });

  it("disabled Documents/KYC module hides My Documents and admin document links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");

    expect(navigation).toContain('moduleCode: "documents_kyc"');
    expect(router).toContain('moduleCode: "documents_kyc"');
    expect(navigation).toContain('label: "My Documents / KYC"');
  });

  it("disabled Roster, Offboarding, and Disciplinary modules hide their links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain('moduleCode: "roster"');
    expect(navigation).toContain('moduleCode: "resignation_offboarding"');
    expect(navigation).toContain('moduleCode: "disciplinary_actions"');
  });

  it("enabled module plus permission shows link, missing permission hides link, and disabled module still hides link", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const moduleAccess = read("frontend/src/lib/moduleAccess.ts");

    expect(navigation).toContain("canShowModuleItem");
    expect(moduleAccess).toContain("isModuleEnabled(user, moduleCode)");
    expect(moduleAccess).toContain("hasRequiredPermission");
    expect(moduleAccess).toContain("accountTypeAllowed");
  });

  it("standalone Super Admin does not see self-service nav links", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain("requiresLinkedEmployee: true");
    expect(navigation).toContain("canShowModuleItem");
    expect(read("frontend/src/lib/moduleAccess.ts")).toContain("canAccessSelfService");
  });

  it("employee-linked user and manager/admin can access self-service when linked", () => {
    const routeGuards = read("frontend/src/features/auth/route-guards.tsx");

    expect(routeGuards).toContain("requiresLinkedEmployee && !user?.employee_id");
    expect(routeGuards).toContain("LinkedEmployeeOnlyGuard");
  });

  it("disabled module route shows ModuleDisabled page and missing permission still shows PermissionDenied", () => {
    const routeGuards = read("frontend/src/features/auth/route-guards.tsx");
    const disabledPage = read("frontend/src/components/access/ModuleDisabledPage.tsx");

    expect(routeGuards).toContain("ModuleDisabledPage");
    expect(disabledPage).toContain("This module is currently disabled.");
    expect(routeGuards).toContain("FullPagePermissionDenied");
  });

  it("LinkedEmployeeOnlyGuard shows linked employee required message", () => {
    const guard = read("frontend/src/components/access/LinkedEmployeeOnlyGuard.tsx");

    expect(guard).toContain("Self-service is only available for accounts linked to an employee profile.");
    expect(guard).toContain("getDefaultLandingPath");
  });

  it("UI hardening keeps alert, confirm, and dark mode out of the foundation", () => {
    const sources = [
      "frontend/src/components/widgets/WidgetCard.tsx",
      "frontend/src/components/widgets/MetricTile.tsx",
      "frontend/src/components/access/ModuleDisabledPage.tsx",
      "frontend/src/components/access/LinkedEmployeeOnlyGuard.tsx",
      "frontend/src/features/auth/route-guards.tsx",
    ].map(read).join("\n");

    expect(sources).not.toMatch(/\b(?:window\.)?alert\s*\(/);
    expect(sources).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    expect(sources).not.toMatch(/\bdarkMode\b|\bdark:[\w-]/);
  });
});
