import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("asset and uniform module toggles", () => {
  it("seeds independent Asset Tracking and Uniform Tracking feature settings", () => {
    const migration = read("migrations/0080_asset_uniform_tracking_feature_settings.sql");
    const leaveMigration = read("migrations/0081_leave_long_leave_management_feature_settings.sql");
    const seeds = read("seeds/feature-settings.seed.sql");
    const bootstrap = read("src/modules/bootstrap/bootstrap.repository.ts");
    const settingsConstants = read("src/modules/settings/settings.constants.ts");

    expect(migration).toContain("INSERT OR IGNORE INTO feature_settings");
    expect(migration).toContain("asset_tracking");
    expect(migration).toContain("uniform_tracking");
    expect(migration).not.toMatch(/DROP\s+|DELETE\s+FROM/i);
    expect(leaveMigration).toContain("leave_management");
    expect(leaveMigration).toContain("long_leave_management");
    expect(leaveMigration).not.toMatch(/DROP\s+|DELETE\s+FROM/i);
    expect(seeds).toContain("Leave Management");
    expect(seeds).toContain("Long Leave Management");
    expect(seeds).toContain("Asset Tracking");
    expect(seeds).toContain("Uniform Tracking");
    expect(bootstrap).toContain("leave_management");
    expect(bootstrap).toContain("long_leave_management");
    expect(bootstrap).toContain("asset_tracking");
    expect(bootstrap).toContain("uniform_tracking");
    expect(settingsConstants).toContain('long_leave_management: ["leave_management", "payroll"]');
    expect(settingsConstants).toContain('asset_tracking: ["employee_management"]');
    expect(settingsConstants).toContain('uniform_tracking: ["employee_management"]');
  });

  it("uses separate backend guards for asset and uniform routes", () => {
    expect(read("src/routes/leave.routes.ts")).toContain('requireFeature("leave_management")');
    expect(read("src/routes/long-leave.routes.ts")).toContain('requireFeature("long_leave_management")');
    expect(read("src/routes/assets.routes.ts")).toContain('requireFeature("asset_tracking")');
    expect(read("src/routes/assets.routes.ts")).not.toContain('requireFeature("assets_uniforms")');
    expect(read("src/routes/uniforms.routes.ts")).toContain('requireFeature("uniform_tracking")');
    expect(read("src/routes/uniforms.routes.ts")).not.toContain('requireFeature("assets_uniforms")');
    expect(read("src/middleware/feature.middleware.ts")).toContain("Asset Tracking is disabled. Enable it in Settings to use this module.");
    expect(read("src/middleware/feature.middleware.ts")).toContain("Uniform Tracking is disabled. Enable it in Settings to use this module.");
    expect(read("src/middleware/feature.middleware.ts")).toContain("Leave Management is disabled. Enable it in Settings to use this module.");
    expect(read("src/middleware/feature.middleware.ts")).toContain("Long Leave Management is disabled. Enable it in Settings to use this module.");
  });

  it("hides and guards secondary UI/report/import surfaces", () => {
    expect(read("frontend/src/lib/navigation.ts")).toContain('moduleCode: "leave_management"');
    expect(read("frontend/src/lib/navigation.ts")).toContain('moduleCode: "long_leave_management"');
    expect(read("frontend/src/lib/navigation.ts")).toContain('moduleCode: "asset_tracking"');
    expect(read("frontend/src/lib/navigation.ts")).toContain('moduleCode: "uniform_tracking"');
    expect(read("frontend/src/features/settings/FeatureSettingsPanel.tsx")).toContain("Disabling this module hides it from normal use but does not delete existing records.");
    expect(read("frontend/src/features/employees/Employee360Page.tsx")).toContain("canViewLeave");
    expect(read("frontend/src/features/employees/Employee360Page.tsx")).toContain("canViewLongLeave");
    expect(read("frontend/src/features/employees/Employee360Page.tsx")).toContain("canViewAssetsUniforms");
    expect(read("frontend/src/features/import-export/ImportExportPage.tsx")).toContain("visibleExportTypes");
    expect(read("frontend/src/features/hr-reports/HrReportsPage.tsx")).toContain("visibleCategories");
    expect(read("frontend/src/features/payroll-reports/PayrollReportsPage.tsx")).toContain("visibleCategories");
    expect(read("src/modules/hr-reports/hr-reports.service.ts")).toContain("LEAVE_MANAGEMENT_DISABLED");
    expect(read("src/modules/payroll-reports/payroll-reports.service.ts")).toContain("LONG_LEAVE_MANAGEMENT_DISABLED");
    expect(read("src/modules/report-exports/report-exports.service.ts")).toContain("ASSETS_UNIFORMS_REPORT_DISABLED");
    expect(read("src/modules/import-export/export-job.service.ts")).toContain("ASSET_TRACKING_DISABLED");
    expect(read("src/modules/import-export/export-job.service.ts")).toContain("LEAVE_MANAGEMENT_DISABLED");
    expect(read("src/modules/imports/imports.service.ts")).toContain("ASSETS_UNIFORMS_IMPORT_DISABLED");
    expect(read("src/modules/imports/imports.service.ts")).toContain("LEAVE_MANAGEMENT_DISABLED");
  });
});
