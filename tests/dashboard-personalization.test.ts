import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => {
  try {
    readFileSync(resolve(root, path), "utf8");
    return true;
  } catch {
    return false;
  }
};

describe("Dashboard Personalization", () => {
  it("adds a safe dashboard preference migration", () => {
    const migration = read("migrations/0078_dashboard_personalization_preferences.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS dashboard_user_preferences");
    expect(migration).toContain("layout_json TEXT NOT NULL");
    expect(migration).toContain("UNIQUE(company_id, user_id, dashboard_type)");
    expect(migration).not.toMatch(/\bDROP\s+TABLE|\bDELETE\s+FROM|\bUPDATE\s+users|\bUPDATE\s+employees/i);
  });

  it("adds authenticated dashboard preference API routes", () => {
    const routes = read("src/routes/dashboard.routes.ts");
    expect(routes).toContain("/preferences/:dashboardType");
    expect(routes).toContain("preferencesController.getPreference");
    expect(routes).toContain("preferencesController.savePreference");
    expect(routes).toContain("preferencesController.resetPreference");
    expect(routes).toContain("authMiddleware");
  });

  it("validates preference payloads and linked employee self-service access", () => {
    const service = read("src/modules/dashboard-preferences/dashboard-preferences.service.ts");
    const types = read("src/modules/dashboard-preferences/dashboard-preferences.types.ts");
    expect(types).toContain('DASHBOARD_TYPES = ["ADMIN_COMMAND_CENTER", "SELF_SERVICE_DASHBOARD"]');
    expect(service).toContain("MAX_LAYOUT_JSON_BYTES");
    expect(service).toContain("containsSensitiveKey");
    expect(service).toContain("sanitizeLayout");
    expect(service).toContain("requireSelfServiceEmployee");
    expect(service).toContain("Self-service is only available for accounts linked to an employee profile.");
  });

  it("creates frontend preference API and personalization components", () => {
    for (const path of [
      "frontend/src/features/dashboard-personalization/dashboardPreferences.api.ts",
      "frontend/src/features/dashboard-personalization/dashboardPreferences.types.ts",
      "frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts",
      "frontend/src/features/dashboard-personalization/DashboardCustomizeButton.tsx",
      "frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx",
      "frontend/src/features/dashboard-personalization/DashboardWidgetListEditor.tsx",
      "frontend/src/features/dashboard-personalization/DashboardWidgetVisibilityToggle.tsx",
      "frontend/src/features/dashboard-personalization/DashboardWidgetOrderControls.tsx",
      "frontend/src/features/dashboard-personalization/DashboardResetLayoutButton.tsx",
      "frontend/src/config/dashboardWidgets.ts",
    ]) {
      expect(exists(path), path).toBe(true);
    }
  });

  it("registers all supported admin and self-service widgets", () => {
    const registry = read("frontend/src/config/dashboardWidgets.ts");
    for (const id of [
      "people-snapshot",
      "attendance-pulse",
      "approval-queue",
      "payroll-readiness",
      "document-expiry",
      "roster-coverage",
      "department-health",
      "employee-attention",
      "lifecycle",
      "disciplinary-follow-up",
      "operation-ownership-health",
      "recent-activity",
      "my-attendance-today",
      "my-attendance-calendar-preview",
      "my-leave-balance",
      "my-upcoming-roster",
      "my-pending-requests",
      "my-documents-kyc",
      "my-payslips",
      "my-approvals",
      "my-offboarding-status",
      "my-acknowledgements",
      "my-recent-activity",
    ]) {
      expect(registry, id).toContain(`id: "${id}"`);
    }
  });

  it("filters widgets by module permission and linked employee after loading preferences, with invalid saved widget ids ignored", () => {
    const utils = read("frontend/src/features/dashboard-personalization/dashboardPreferences.utils.ts");
    expect(utils).toContain("canShowModuleItem");
    expect(utils).toContain("getAllowedDashboardWidgets");
    expect(utils).toContain("mergeDashboardPreferences");
    expect(utils).toContain("savedById");
    expect(utils).toContain("visibleDashboardWidgets");
    expect(utils).toContain("requiresLinkedEmployee");
  });

  it("integrates personalization into admin and self-service dashboards", () => {
    const admin = read("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");
    const self = read("frontend/src/features/self-service/EmployeeDashboardPage.tsx");
    expect(admin).toContain("DashboardCustomizeButton");
    expect(admin).toContain('usePersonalizedWidgets("ADMIN_COMMAND_CENTER"');
    expect(admin).toContain("personalization.visibleWidgets.map");
    expect(self).toContain("DashboardCustomizeButton");
    expect(self).toContain('usePersonalizedWidgets("SELF_SERVICE_DASHBOARD"');
    expect(self).toContain("LinkedEmployeeOnlyGuard");
  });

  it("uses move up/down reset and toast feedback instead of browser dialogs", () => {
    const combined = [
      "frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx",
      "frontend/src/features/dashboard-personalization/DashboardWidgetOrderControls.tsx",
      "frontend/src/features/dashboard-personalization/DashboardResetLayoutButton.tsx",
    ].map(read).join("\n");
    expect(combined).toContain("Move widget up");
    expect(combined).toContain("Move widget down");
    expect(combined).toContain("Reset to default");
    expect(combined).toContain("toast.success");
    expect(combined).not.toMatch(/\balert\s*\(/);
    expect(combined).not.toMatch(/\bconfirm\s*\(/);
  });

  it("does not introduce dark mode", () => {
    const combined = [
      "frontend/src/features/dashboard-personalization/DashboardCustomizeDialog.tsx",
      "frontend/src/features/dashboard-personalization/DashboardCustomizeButton.tsx",
      "frontend/src/config/dashboardWidgets.ts",
      "frontend/src/features/dashboard/AdminCommandCenterPage.tsx",
      "frontend/src/features/self-service/EmployeeDashboardPage.tsx",
    ].map(read).join("\n");
    expect(combined).not.toMatch(/dark:|darkMode|ThemeProvider/);
  });
});
