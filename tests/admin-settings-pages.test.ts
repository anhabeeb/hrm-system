import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { validateUpdateSettingsGroupInput } from "../src/modules/settings/settings.validators";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const emptyEnv = { DB: {} } as Env;

describe("settings and admin route registration", () => {
  it.each([
    "/api/v1/company/profile",
    "/api/v1/audit-logs",
    "/api/v1/profile-update-requests",
    "/api/v1/settings/security",
    "/api/v1/settings/attendance",
    "/api/v1/settings/leave",
    "/api/v1/settings/payroll",
    "/api/v1/settings/documents",
    "/api/v1/settings/backup",
    "/api/v1/settings/notifications",
    "/api/v1/settings/reports",
    "/api/v1/settings/import-export",
    "/api/v1/settings/devices-sync",
  ])("%s is registered and requires authentication", async (path) => {
    const response = await app.request(path, {}, emptyEnv);
    const body = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("AUTH_REQUIRED");
  });
});

describe("structured settings validation", () => {
  it("rejects unknown settings keys in structured groups", () => {
    expect(() =>
      validateUpdateSettingsGroupInput("attendance", {
        settings: { "attendance.raw_table_escape": { enabled: true } },
        reason: "Testing validation",
      }),
    ).toThrow("Please choose a valid setting for this section.");
  });

  it("normalizes company email and validates currency/timezone", () => {
    const input = validateUpdateSettingsGroupInput("company", {
      settings: {
        "company.profile": { company_email: "ADMIN@EXAMPLE.COM" },
        "company.basic": { currency: "MVR", timezone: "Indian/Maldives" },
      },
      reason: "Updating company profile",
    });

    expect(input.settings["company.profile"].company_email).toBe("admin@example.com");
  });

  it("keeps backend lifecycle dependency checks for parent modules and sub-features", () => {
    const service = read("src/modules/settings/settings.service.ts");
    const validators = read("src/modules/settings/settings.validators.ts");

    expect(validators).toContain("validateNoEnabledDependentsBeforeDisable");
    expect(validators).toContain("FEATURE_DEPENDENCIES");
    expect(service).toContain("validateFeatureDisableSettingsDependencies");
    expect(service).toContain("validateFeatureDependencies(featureKey, false, enabledFeatures)");
    expect(service).toContain("Disable Attendance Payroll Deductions and Payroll Attendance Deductions before disabling Attendance Management.");
    expect(service).toContain("Disable payroll deduction sub-features before disabling Payroll Management.");
    expect(service).toContain("Payroll attendance deductions require Attendance Payroll Deductions to be enabled first.");
    expect(service).toContain("Payroll long leave deductions require Long Leave Management to be enabled first.");
    expect(service).toContain("Contract document upload requires Contract Tracking and Document Tracking to be enabled first.");
  });
});

describe("settings and administration frontend pages", () => {
  it("navigation exposes the requested Administration and Settings pages", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    for (const label of [
      "Users & Access",
      "Profile Update Requests",
      "Audit Logs",
      "Company Information",
      "Security",
      "Attendance",
      "Leave",
      "Payroll",
      "Documents",
      "Backup & Recovery",
      "Notifications",
      "Reports",
      "Import / Export",
      "Devices & Sync",
    ]) {
      expect(navigation).toContain(label);
    }
  });

  it("settings pages use structured forms instead of raw setting tables", () => {
    const settingsHub = read("frontend/src/features/settings/SettingsPage.tsx");
    const structuredPanel = read("frontend/src/features/settings/StructuredSettingsPanel.tsx");

    expect(settingsHub).toContain("settingsLinks");
    expect(settingsHub).toContain("Open settings");
    expect(settingsHub).toContain("Review setup-critical settings and open a module settings page to configure availability, effective date, and detailed module options.");
    expect(settingsHub).toContain("ModuleStatusOverview");
    expect(settingsHub).toContain("Company Information");
    expect(settingsHub).toContain("Backup & Recovery");
    expect(settingsHub).toContain("Asset Tracking");
    expect(settingsHub).toContain("Uniform Tracking");
    expect(settingsHub).toContain("Duty Roster");
    expect(settingsHub).toContain("Contract Tracking");
    expect(structuredPanel).toContain("Reason for change");
    expect(structuredPanel).toContain("AppDatePicker");
    expect(structuredPanel).toContain("effective_date");
    expect(structuredPanel).toContain("Save changes");
    expect(structuredPanel).not.toContain("Editable structured forms for this section will be expanded");
  });

  it("module settings pages expose availability controls with effective dates", () => {
    const availabilityPanel = read("frontend/src/features/settings/ModuleAvailabilityPanel.tsx");
    const featureDialog = read("frontend/src/features/settings/FeatureReasonDialog.tsx");
    const moduleStatusOverview = read("frontend/src/features/settings/ModuleStatusOverview.tsx");
    const modulePages = read("frontend/src/features/settings/module/ModuleSettingsPages.tsx");
    const router = read("frontend/src/app/router.tsx");
    const navigation = read("frontend/src/lib/navigation.ts");
    const setupGuide = read("src/modules/setup-guide/setup-guide.service.ts");

    expect(availabilityPanel).toContain("ModuleAvailabilityPanel");
    expect(availabilityPanel).toContain("settingsApi.updateFeature");
    expect(availabilityPanel).toContain("effective_from");
    expect(availabilityPanel).toContain("auth.refreshMe()");
    expect(availabilityPanel).toContain('queryKey: ["navigation"]');
    expect(availabilityPanel).toContain('queryKey: ["dashboard"]');
    expect(moduleStatusOverview).toContain("Module Status Overview");
    expect(moduleStatusOverview).toContain("Open module settings");
    expect(featureDialog).toContain("AppDatePicker");
    expect(featureDialog).toContain("Effective from");
    expect(modulePages).toContain('featureKey="asset_tracking"');
    expect(modulePages).toContain('featureKey="uniform_tracking"');
    expect(modulePages).toContain('featureKey="roster"');
    expect(modulePages).toContain('featureKey="contract_tracking"');
    expect(router).toContain('path="/settings/assets"');
    expect(router).toContain('path="/settings/uniforms"');
    expect(router).toContain('path="/settings/roster"');
    expect(router).toContain('path="/settings/contracts"');
    expect(navigation).toContain('path: "/settings/assets"');
    expect(navigation).toContain('path: "/settings/uniforms"');
    expect(navigation).toContain('path: "/settings/roster"');
    expect(navigation).toContain('path: "/settings/contracts"');
    expect(setupGuide).toContain("settingsService.updateFeature");
    expect(setupGuide).toContain("effective_from");
  });

  it("profile update requests page supports email update review actions", () => {
    const source = read("frontend/src/features/profile-update-requests/ProfileUpdateRequestsPage.tsx");

    expect(source).toContain("Email Update");
    expect(source).toContain("Current email");
    expect(source).toContain("Requested new email");
    expect(source).toContain("Approve");
    expect(source).toContain("Reject");
  });

  it("audit logs page renders filters and masks details through the backend API", () => {
    const source = read("frontend/src/features/audit/AuditLogsPage.tsx");
    const service = read("src/modules/audit-logs/audit-logs.service.ts");

    expect(source).toContain("Actor user");
    expect(source).toContain("Request ID");
    expect(source).toContain("Before");
    expect(source).toContain("After");
    expect(service).toContain("[masked]");
  });
});
