import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(resolve(process.cwd(), dir)).flatMap((entry) => {
    const relative = `${dir}/${entry}`;
    const absolute = resolve(process.cwd(), relative);
    if (statSync(absolute).isDirectory()) return walk(relative);
    return relative;
  });

describe("settings navigation module consistency", () => {
  it("checks module aliases and required features together", () => {
    const moduleAccess = read("frontend/src/lib/moduleAccess.ts");
    const navigationAccess = read("frontend/src/lib/navigationAccess.ts");
    const guards = read("frontend/src/features/auth/route-guards.tsx");

    expect(moduleAccess).toContain("isRouteFeatureAllowed");
    expect(moduleAccess).toContain("hasFeature(user, options.requiredFeature)");
    expect(moduleAccess).toContain("areRequiredFeaturesEnabled(user, options.requiredFeaturesAll)");
    expect(navigationAccess).toContain("requiredFeature: item.requiredFeature");
    expect(guards).toContain("isRouteFeatureAllowed(user, { moduleCode, requiredFeature, moduleCodesAll, requiredFeaturesAll })");
    expect(`${moduleAccess}\n${navigationAccess}\n${guards}`).not.toContain("moduleCode ?? requiredFeature");
    expect(`${moduleAccess}\n${navigationAccess}\n${guards}`).not.toContain("moduleCodesAll ?? requiredFeaturesAll");
  });

  it("keeps Documents and KYC navigation separated by their real features", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");

    expect(navigation).toContain('label: "My Documents", path: "/self/documents", icon: FileText, moduleCode: "document_tracking", requiredFeature: "documents"');
    expect(navigation).toContain('label: "Documents", path: "/documents", icon: FileText, moduleCode: "document_tracking", requiredFeature: "documents"');
    expect(navigation).toContain('label: "My KYC Requests"');
    expect(navigation).toContain('requiredFeature: "kyc_update_requests"');
    expect(router).toContain('path="/self/documents"');
    expect(router).toContain('moduleCode: "document_tracking"');
    expect(router).toContain('path="/profile/kyc-update"');
    expect(router).toContain('feature: "kyc_update_requests"');
  });

  it("preserves payroll and attendance sub-feature navigation guards", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");

    for (const marker of [
      'requiredPayrollSubFeature: "payslips_enabled"',
      'requiredPayrollSubFeature: "advances_enabled"',
      'requiredPayrollSubFeature: "salary_loans_enabled"',
      'requiredAttendanceSubFeature: "kiosk_enabled"',
      'requiredAttendanceSubFeature: "biometric_enabled"',
      'requiredAttendanceSubFeature: "corrections_enabled"',
    ]) {
      expect(`${navigation}\n${router}`).toContain(marker);
    }
  });

  it("exposes leave policy rules from settings and leave pages", () => {
    const router = read("frontend/src/app/router.tsx");
    const leaveSettings = read("frontend/src/features/settings/leave/LeaveSettingsPage.tsx");
    const leavePolicyRulesSettings = read("frontend/src/features/settings/leave/LeavePolicyRulesSettingsPanel.tsx");
    const leaveTypesPanel = read("frontend/src/features/leave/LeaveTypesPanel.tsx");

    expect(router).not.toContain('path="/settings/leave/policy-rules"');
    expect(leaveSettings).toContain("Open Leave Policy Rules");
    expect(leaveSettings).toContain("Leave Policy Rules");
    expect(leaveSettings).toContain("LeavePolicyRulesSettingsPanel");
    expect(leavePolicyRulesSettings).toContain("Configure document requirements, salary deduction rules, allowance/pay component deductions, approval behavior, and entitlement rules for each leave type.");
    expect(leavePolicyRulesSettings).toContain("Edit Policy Rules");
    expect(leaveTypesPanel).toContain("Open Leave Policy Settings");
    expect(leaveTypesPanel).toContain("/settings/leave?section=policy-rules&highlight=leave-policy-rules");
  });

  it("keeps global settings free of editable all-module feature toggles", () => {
    const settingsPage = read("frontend/src/features/settings/SettingsPage.tsx");
    const moduleStatusOverview = read("frontend/src/features/settings/ModuleStatusOverview.tsx");

    expect(settingsPage).not.toContain("<FeatureSettingsPanel");
    expect(settingsPage).not.toContain("Switch");
    expect(settingsPage).toContain("<ModuleStatusOverview");
    expect(moduleStatusOverview).toContain("Module Status Overview");
    expect(moduleStatusOverview).toContain('data-setup-target="module-status-overview"');
    expect(moduleStatusOverview).toContain("Open module settings");
  });

  it("renders real interactable settings sections for setup guide targets", () => {
    const settingsPage = read("frontend/src/features/settings/SettingsPage.tsx");
    const structuredSettings = read("frontend/src/features/settings/structured-settings.ts");
    const modulePages = read("frontend/src/features/settings/module/ModuleSettingsPages.tsx");
    const setupGuideRegistry = read("src/modules/setup-guide/setup-guide.registry.ts");

    for (const marker of [
      "Employee Numbering",
      "employee-numbering",
      "Self-Service Settings",
      "self-service-settings",
      "Approval Workflows",
      "approval-workflows",
      "Asset Issue Rules",
      "asset-issue-rules",
      "Uniform Issue Rules",
      "uniform-issue-rules",
    ]) {
      expect(`${settingsPage}\n${structuredSettings}\n${modulePages}`).toContain(marker);
    }
    expect(modulePages).toContain("StructuredSettingsPanel");
    expect(modulePages).toContain("additionalSettingsPageDefinitions.assets");
    expect(modulePages).toContain("additionalSettingsPageDefinitions.uniforms");
    expect(setupGuideRegistry).toContain("/settings?section=numbering");
    expect(setupGuideRegistry).toContain("/settings?section=employee-access");
    expect(setupGuideRegistry).toContain("/settings?section=workflows");
    expect(setupGuideRegistry).toContain("/settings/assets?section=issue-rules");
    expect(setupGuideRegistry).toContain("/settings/uniforms?section=issue-rules");
    expect(setupGuideRegistry).toContain("highlight=module-status-overview");
    expect(setupGuideRegistry).not.toContain("highlight=feature-controls");
  });

  it("shows availability panels on feature-backed settings pages", () => {
    const expected = [
      ["frontend/src/features/settings/backup/BackupSettingsPage.tsx", 'featureKey="backup_recovery"'],
      ["frontend/src/features/settings/notifications/NotificationsSettingsPage.tsx", 'featureKey="notifications"'],
      ["frontend/src/features/settings/reports/ReportsSettingsPage.tsx", 'featureKey="reports"'],
      ["frontend/src/features/settings/import-export/ImportExportSettingsPage.tsx", 'featureKey="import_export"'],
      ["frontend/src/features/settings/devices-sync/DevicesSyncSettingsPage.tsx", 'featureKey="offline_sync"'],
    ];

    for (const [file, marker] of expected) {
      const source = read(file);
      expect(source).toContain("ModuleAvailabilityPanel");
      expect(source).toContain(marker);
    }
  });

  it("keeps effective dates and shared date pickers consistent", () => {
    expect(read("frontend/src/features/settings/FeatureReasonDialog.tsx")).toContain("effective_from");
    expect(read("frontend/src/features/settings/StructuredSettingsPanel.tsx")).toContain("effective_date");

    const frontendFiles = walk("frontend/src").filter((file) => /\.(tsx?|jsx?)$/.test(file));
    const allowedNativeDateFiles = new Set([
      "frontend/src/components/forms/AppDatePicker.tsx",
      "frontend/src/components/forms/AppMonthPicker.tsx",
    ]);
    for (const file of frontendFiles) {
      const source = read(file);
      expect(/type=["'](?:date|month)["']/.test(source) && !allowedNativeDateFiles.has(file), file).toBe(false);
    }
  });
});
