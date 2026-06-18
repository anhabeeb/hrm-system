import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const collectFiles = (dir: string, predicate: (file: string) => boolean, files: string[] = []) => {
  for (const entry of readdirSync(path.join(root, dir))) {
    const relative = path.join(dir, entry);
    const absolute = path.join(root, relative);
    if (statSync(absolute).isDirectory()) collectFiles(relative, predicate, files);
    else if (predicate(relative)) files.push(relative);
  }
  return files;
};

describe("interactive setup guide", () => {
  it("exposes setup guide API routes and activity actions", () => {
    const routes = read("src/routes/setup-guide.routes.ts");

    expect(routes).toContain('get("/status"');
    expect(routes).toContain('get("/activities"');
    expect(routes).toContain('post("/activities/:activityKey/start"');
    expect(routes).toContain('post("/activities/:activityKey/complete"');
    expect(routes).toContain('post("/activities/:activityKey/skip"');
    expect(routes).toContain('post("/activities/:activityKey/resume"');
    expect(routes).toContain('post("/finish"');
    expect(routes).toContain('post("/skip-for-now"');
    expect(routes).toContain('post("/module-choice"');
  });

  it("calculates module-aware setup progress for disabled and re-enabled modules", () => {
    const service = read("src/modules/setup-guide/setup-guide.service.ts");

    expect(service).toContain("disabled_by_choice");
    expect(service).toContain("needs_setup_after_enable");
    expect(service).toContain("review_recommended");
    expect(service).toContain("is_counted_required");
    expect(service).toContain("MODULE_LIFECYCLE_METADATA");
  });

  it("registers core and enabled-module setup activities", () => {
    const registry = read("src/modules/setup-guide/setup-guide.registry.ts");

    expect(registry).toContain("company_profile");
    expect(registry).toContain("outlets");
    expect(registry).toContain("feature_modules");
    expect(registry).toContain("feature-controls");
    expect(registry).toContain("leave_management");
    expect(registry).toContain("long_leave_management");
    expect(registry).toContain("attendance");
    expect(registry).toContain("payroll");
    expect(registry).toContain("approval_workflows");
  });

  it("maps every setup activity highlight target to a frontend setup target marker", () => {
    const registry = read("src/modules/setup-guide/setup-guide.registry.ts");
    const frontendSources = collectFiles("frontend/src", (file) => /\.(tsx|ts|css)$/.test(file))
      .map(read)
      .join("\n");
    const targetKeys = [...registry.matchAll(/highlight=([^"&]+)"/g)].map((match) => match[1]);

    expect(targetKeys.length).toBeGreaterThan(0);
    for (const target of targetKeys) {
      expect(frontendSources, `${target} target should exist in frontend setup surfaces`).toContain(target);
    }
  });

  it("uses real feature settings updates for setup module choices", () => {
    const service = read("src/modules/setup-guide/setup-guide.service.ts");

    expect(service).toContain("settingsService.updateFeature");
    expect(service).toContain("setup_wizard_module_disabled_by_choice");
    expect(service).toContain("setup_wizard_module_enabled_later");
  });

  it("keeps skip for now separate from final setup completion", () => {
    const service = read("src/modules/setup-guide/setup-guide.service.ts");
    const stepPanel = read("frontend/src/features/setup-guide/SetupStepPanel.tsx");

    expect(service).toContain("Complete the remaining required setup steps before finishing setup. You can Save & Exit to continue later.");
    expect(stepPanel).toContain("this step remains incomplete until configured");
  });

  it("adds frontend wizard route, coach marks, and dashboard reminder", () => {
    const router = read("frontend/src/app/router.tsx");
    const shell = read("frontend/src/components/layout/AppShell.tsx");
    const dashboard = read("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");
    const overlay = read("frontend/src/features/setup-guide/SetupGuideOverlay.tsx");
    const api = read("frontend/src/features/setup-guide/setupGuide.api.ts");
    const kebabApi = read("frontend/src/features/setup-guide/setup-guide.api.ts");
    const progressBanner = read("frontend/src/features/setup-guide/SetupProgressBanner.tsx");

    expect(router).toContain("/setup-wizard");
    expect(api).toContain("/setup-guide/status");
    expect(api).toContain("/setup-guide/activities");
    expect(api).toContain("/setup-guide/skip-for-now");
    expect(kebabApi).toContain("setupGuideApi");
    expect(progressBanner).toContain("Disabled by choice");
    expect(shell).toContain("SetupGuideGate");
    expect(shell).toContain("SetupGuideOverlay");
    expect(dashboard).toContain("SetupIncompleteDashboardBanner");
    expect(overlay).toContain("data-setup-target");
    expect(overlay).toContain("setupGuide");
    expect(overlay).toContain("highlight");
  });

  it("includes the required guided setup target anchors", () => {
    const frontendSources = collectFiles("frontend/src", (file) => /\.(tsx|ts|css)$/.test(file))
      .map(read)
      .join("\n");

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
      "departments-list",
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
      expect(frontendSources, `${target} setup target should exist`).toContain(target);
    }
  });

  it("does not use browser alert or confirm in setup guide UI", () => {
    const sources = [
      "frontend/src/features/setup-guide/SetupWizardPage.tsx",
      "frontend/src/features/setup-guide/SetupStepPanel.tsx",
      "frontend/src/features/setup-guide/SetupGuideOverlay.tsx",
    ].map(read).join("\n");

    expect(sources).not.toMatch(/alert\s*\(/);
    expect(sources).not.toMatch(/confirm\s*\(/);
  });
});
