import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  validateEmployeeStructureInput,
  validateLevelRoleTemplateInput,
} from "../src/modules/employee-structure/employee-structure.validators";
import { validatePositionCreateInput } from "../src/modules/positions/positions.validators";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("employee structure foundation", () => {
  it("validates position levels between 1 and 4", () => {
    expect(() =>
      validatePositionCreateInput({
        title: "Supervisor",
        code: "SUP",
        department_id: "dept_1",
        level: 3,
        status: "active",
      }),
    ).not.toThrow();

    expect(() =>
      validatePositionCreateInput({
        title: "Invalid",
        department_id: "dept_1",
        level: 5,
      }),
    ).toThrow(/Level must be between 1 and 4/);
  });

  it("requires employee structure department and position assignment", () => {
    expect(validateEmployeeStructureInput({
      department_id: "dept_1",
      position_id: "pos_1",
      reason: "Promotion",
    })).toMatchObject({
      department_id: "dept_1",
      position_id: "pos_1",
      reason: "Promotion",
    });

    expect(() => validateEmployeeStructureInput({ department_id: "", position_id: "pos_1" })).toThrow(/Department is required/);
    expect(() => validateEmployeeStructureInput({ department_id: "dept_1", position_id: "" })).toThrow(/Position is required/);
  });

  it("validates level role template levels and required role", () => {
    expect(validateLevelRoleTemplateInput({
      level: 4,
      role_id: "role_manager",
      department_id: null,
      position_id: null,
      is_default: true,
      is_required: false,
    })).toMatchObject({ level: 4, role_id: "role_manager" });

    expect(() => validateLevelRoleTemplateInput({ level: 0, role_id: "role_1" })).toThrow(/Level must be between 1 and 4/);
    expect(() => validateLevelRoleTemplateInput({ level: 2, role_id: "" })).toThrow(/Role is required/);
  });

  it("adds additive migration tables, indexes, and employee structure columns", () => {
    const migration = read("migrations/0060_employee_structure_foundation.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS access_levels");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS level_role_templates");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_structure_history");
    expect(migration).toContain("ALTER TABLE employees ADD COLUMN level");
    expect(migration).toContain("idx_employees_company_level");
    expect(migration).toContain("idx_level_role_templates_company_level");
  });

  it("exposes organization and employee structure routes with permissions", () => {
    const organizationRoutes = read("src/routes/organization.routes.ts");
    const employeesRoutes = read("src/routes/employees.routes.ts");
    expect(organizationRoutes).toContain('organizationRoutes.get("/departments"');
    expect(organizationRoutes).toContain('organizationRoutes.get("/level-role-templates"');
    expect(organizationRoutes).toContain("organization.levelRoleTemplates.manage");
    expect(employeesRoutes).toContain('/:id/structure');
    expect(employeesRoutes).toContain('/:id/apply-level-role-template');
    expect(employeesRoutes).toContain("employees.structure.manage");
  });

  it("keeps levels as role suggestions instead of automatic sensitive access grants", () => {
    const service = read("src/modules/employee-structure/employee-structure.service.ts");
    expect(service).toContain("addUserRoles");
    expect(service).not.toContain("payroll.full_access");
    expect(service).not.toContain("permissions.manage");
    expect(service).toContain("skipped");
  });

  it("adds frontend structure pages and uses toasts instead of browser alerts", () => {
    const page = read("frontend/src/features/organization/LevelRoleTemplatesPage.tsx");
    const dialog = read("frontend/src/features/employees/EmployeeStructureDialog.tsx");
    expect(page).toContain("LevelRoleTemplatesPage");
    expect(page).toContain("toastSuccess");
    expect(page).not.toMatch(/window\.alert|window\.confirm/);
    expect(dialog).toContain("Derived level");
    expect(dialog).toContain("Select a department first");
    expect(dialog).not.toMatch(/window\.alert|window\.confirm/);
  });
});
