import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("module-enabled visibility controls", () => {
  it("uses module enabled state without a Super Admin frontend bypass", () => {
    const features = `${read("frontend/src/lib/features.ts")}\n${read("frontend/src/config/moduleCodes.ts")}`;

    expect(features).toContain("MODULE_FEATURE_ALIASES");
    expect(features).toContain("isModuleEnabled");
    expect(features).toContain("disciplinary_actions");
    expect(features).toContain("resignation_offboarding");
    expect(features).not.toContain("isSuperAdmin(user)) return true");
  });

  it("hides disabled modules in sidebar navigation before permission checks pass the link", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain("canShowModuleItem");
    expect(read("frontend/src/lib/moduleAccess.ts")).toContain("isModuleEnabled(user, moduleCode)");
    expect(navigation).toContain('label: "My Leave"');
    expect(navigation).toContain('moduleCode: "leave_management"');
    expect(navigation).toContain('label: "My Attendance"');
    expect(navigation).toContain('moduleCode: "attendance"');
    expect(navigation).toContain('label: "Payroll"');
    expect(navigation).toContain('moduleCode: "payroll"');
    expect(navigation).toContain('label: "Payslips"');
    expect(navigation).toContain('moduleCodesAll: ["payroll", "payslips"]');
    expect(navigation).toContain('requiredPayrollSubFeature: "payslips_enabled"');
    expect(navigation).toContain('label: "My Documents"');
    expect(navigation).toContain('label: "My KYC Requests"');
    expect(navigation).toContain('moduleCode: "documents_kyc"');
    expect(navigation).toContain('label: "Duty Rosters"');
    expect(navigation).toContain('moduleCode: "roster"');
    expect(navigation).toContain('label: "Contracts"');
    expect(navigation).toContain('moduleCodesAll: ["employees", "contract_tracking"]');
    expect(navigation).toContain('label: "Offboarding"');
    expect(navigation).toContain('moduleCode: "resignation_offboarding"');
    expect(navigation).toContain('label: "Disciplinary Actions"');
    expect(navigation).toContain('moduleCode: "disciplinary_actions"');
    expect(read("frontend/src/lib/moduleAccess.ts")).toContain("!requiresLinkedEmployee(options) || canAccessSelfService(user)");
  });

  it("blocks disabled module routes even when URLs are opened manually", () => {
    const guards = read("frontend/src/features/auth/route-guards.tsx");
    const router = read("frontend/src/app/router.tsx");

    expect(guards).toContain("moduleCode?: string");
    expect(guards).toContain("isModuleEnabled(user, moduleCode ?? requiredFeature)");
    expect(router).toContain('moduleCode: "leave_management"');
    expect(router).toContain('moduleCode: "attendance"');
    expect(router).toContain('moduleCode: "roster"');
    expect(router).toContain('moduleName: "Contract Tracking"');
    expect(router).toContain('moduleCode: "documents_kyc"');
    expect(router).toContain('featuresAll: ["payroll", "advance_salary"]');
    expect(router).toContain('moduleCode: "resignation_offboarding"');
    expect(router).toContain('moduleCode: "disciplinary_actions"');
    expect(router).toContain("requiresLinkedEmployee: true");
  });

  it("applies disabled-module guards to backend module APIs without Super Admin bypass", () => {
    const middleware = read("src/middleware/feature.middleware.ts");
    const errors = read("src/utils/errors.ts");
    const disciplineRoutes = read("src/routes/employee-discipline.routes.ts");
    const offboardingRoutes = read("src/routes/offboarding.routes.ts");
    const employeesRoutes = read("src/routes/employees.routes.ts");
    const advancesRoutes = read("src/routes/advances.routes.ts");
    const operationOwnershipRoutes = read("src/routes/operation-ownership.routes.ts");

    expect(middleware).toContain("resolveModuleFeatureAliases");
    expect(middleware).toContain('FeatureDisabledError("This module is currently disabled.")');
    expect(middleware).not.toContain("isSuperAdmin");
    expect(errors).toContain('This module is currently disabled.');
    expect(disciplineRoutes).toContain('requireFeature("disciplinary_actions")');
    expect(offboardingRoutes).toContain('requireFeature("resignation_offboarding")');
    expect(employeesRoutes).toContain('requireFeature("employee_structure_changes")');
    expect(employeesRoutes).toContain('requireFeature("resignation_offboarding")');
    expect(advancesRoutes).toContain('requireFeature("advance_salary")');
    expect(operationOwnershipRoutes).toContain('requireFeature("operation_ownership")');
    expect(read("src/routes/contracts.routes.ts")).toContain('requireFeature("contract_tracking")');
  });

  it("seeds dedicated module switches and gates dashboard quick actions by enabled modules", () => {
    const migration = read("migrations/0077_module_visibility_feature_settings.sql");
    const bootstrap = read("src/modules/bootstrap/bootstrap.repository.ts");
    const dashboard = read("src/modules/dashboard/dashboard.service.ts");

    for (const moduleCode of [
      "operation_ownership",
      "payroll_adjustments",
      "advance_salary",
      "employee_structure_changes",
      "resignation_offboarding",
      "disciplinary_actions",
    ]) {
      expect(migration).toContain(moduleCode);
      expect(bootstrap).toContain(moduleCode);
    }
    expect(migration).toContain("INSERT OR IGNORE INTO feature_settings");
    expect(dashboard).toContain("listEnabledFeatureKeys");
    expect(dashboard).toContain("moduleEnabled(features");
    expect(dashboard).toContain("getQuickActionsForEnabledModules");
  });
});
