import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  departmentsRepository: {
    findDepartmentById: vi.fn(),
    findDepartmentByCode: vi.fn(),
    findDepartmentByName: vi.fn(),
    findHeadEmployee: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    countAssignedEmployees: vi.fn(),
    countAssignedPositions: vi.fn(),
  },
  positionsRepository: {
    findPositionById: vi.fn(),
    findPositionByCode: vi.fn(),
    findPositionByTitleInDepartment: vi.fn(),
    findDepartment: vi.fn(),
    findRole: vi.fn(),
    createPosition: vi.fn(),
    updatePosition: vi.fn(),
    countAssignedEmployees: vi.fn(),
  },
  structureRepository: {
    findEmployeeStructure: vi.fn(),
    findDepartment: vi.fn(),
    findPosition: vi.fn(),
    findRole: vi.fn(),
    findDuplicateTemplate: vi.fn(),
    createLevelRoleTemplate: vi.fn(),
    findLevelRoleTemplateById: vi.fn(),
    findTemplatesForStructure: vi.fn(),
    getUserRoleIds: vi.fn(),
    addUserRoles: vi.fn(),
    closeOpenStructureHistory: vi.fn(),
    updateEmployeeStructure: vi.fn(),
    createStructureHistory: vi.fn(),
  },
  audit: {
    createAuditLog: vi.fn(),
  },
  permission: {
    hasOutletAccess: vi.fn(),
  },
}));

vi.mock("../src/modules/departments/departments.repository", () => mocks.departmentsRepository);
vi.mock("../src/modules/positions/positions.repository", () => mocks.positionsRepository);
vi.mock("../src/modules/employee-structure/employee-structure.repository", () => mocks.structureRepository);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permission);

import {
  validateEmployeeStructureInput,
  validateLevelRoleTemplateInput,
} from "../src/modules/employee-structure/employee-structure.validators";
import { validatePositionCreateInput } from "../src/modules/positions/positions.validators";
import * as departmentsService from "../src/modules/departments/departments.service";
import * as positionsService from "../src/modules/positions/positions.service";
import * as structureService from "../src/modules/employee-structure/employee-structure.service";
import type { AuthActor } from "../src/types/api.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const env = {} as Env;
const actor: AuthActor = {
  actorUserId: "user_hr",
  fullName: "HR Admin",
  email: "hr@example.com",
  companyId: "company_1",
  roles: ["hr_admin"],
  permissions: ["employees.structure.manage"],
  roleKeys: ["hr_admin"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  requestId: "req_test",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

const departmentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "dept_1",
  company_id: "company_1",
  code: "OPS",
  name: "Operations",
  status: "active",
  is_active: 1,
  archived_at: null,
  deleted_at: null,
  day_to_day_management_min_level: 3,
  ...overrides,
});

const positionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "pos_1",
  company_id: "company_1",
  department_id: "dept_1",
  code: "SUP",
  title: "Supervisor",
  level: 3,
  status: "active",
  is_active: 1,
  archived_at: null,
  deleted_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
  mocks.permission.hasOutletAccess.mockReturnValue(true);
});

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

  it("creates departments, blocks duplicate codes, validates head company, and manages status/archive safety", async () => {
    mocks.departmentsRepository.findDepartmentByCode.mockResolvedValueOnce(null);
    mocks.departmentsRepository.findDepartmentByName.mockResolvedValueOnce(null);
    mocks.departmentsRepository.findHeadEmployee.mockResolvedValueOnce({ id: "emp_head" });
    mocks.departmentsRepository.findDepartmentById.mockResolvedValue(departmentRecord());

    await expect(departmentsService.createDepartment(env, actor, {
      code: "OPS",
      name: "Operations",
      head_employee_id: "emp_head",
      status: "active",
    })).resolves.toMatchObject({ department: expect.objectContaining({ id: "dept_1" }) });
    expect(mocks.departmentsRepository.createDepartment).toHaveBeenCalled();
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "department_created" }));

    mocks.departmentsRepository.findDepartmentByCode.mockResolvedValueOnce(departmentRecord({ id: "dept_existing" }));
    await expect(departmentsService.createDepartment(env, actor, { code: "OPS", name: "Duplicate", status: "active" }))
      .rejects.toThrow(/department code is already in use/i);

    mocks.departmentsRepository.findDepartmentByCode.mockResolvedValueOnce(null);
    mocks.departmentsRepository.findDepartmentByName.mockResolvedValueOnce(null);
    mocks.departmentsRepository.findHeadEmployee.mockResolvedValueOnce(null);
    await expect(departmentsService.createDepartment(env, actor, { code: "HR", name: "HR", head_employee_id: "emp_other", status: "active" }))
      .rejects.toThrow(/same company/i);

    mocks.departmentsRepository.findDepartmentById.mockResolvedValue(departmentRecord());
    await departmentsService.setDepartmentStatus(env, actor, "dept_1", "disabled", "Testing disable");
    await departmentsService.setDepartmentStatus(env, actor, "dept_1", "active", "Testing enable");
    expect(mocks.departmentsRepository.updateDepartment).toHaveBeenCalledWith(expect.anything(), "company_1", "dept_1", expect.objectContaining({ status: "disabled" }));
    expect(mocks.departmentsRepository.updateDepartment).toHaveBeenCalledWith(expect.anything(), "company_1", "dept_1", expect.objectContaining({ status: "active" }));

    mocks.departmentsRepository.countAssignedEmployees.mockResolvedValueOnce(1);
    mocks.departmentsRepository.countAssignedPositions.mockResolvedValueOnce(0);
    await expect(departmentsService.deleteDepartment(env, actor, "dept_1", "Archive"))
      .rejects.toThrow(/active employees or positions/i);
  });

  it("creates positions and rejects invalid, duplicate, cross-company, and inactive-department inputs", async () => {
    mocks.positionsRepository.findPositionByCode.mockResolvedValueOnce(null);
    mocks.positionsRepository.findDepartment.mockResolvedValueOnce(departmentRecord());
    mocks.positionsRepository.findPositionByTitleInDepartment.mockResolvedValueOnce(null);
    mocks.positionsRepository.findRole.mockResolvedValueOnce({ id: "role_supervisor" });
    mocks.positionsRepository.findPositionById.mockResolvedValue(positionRecord());

    await expect(positionsService.createPosition(env, actor, {
      code: "SUP",
      title: "Supervisor",
      department_id: "dept_1",
      level: 3,
      default_role_id: "role_supervisor",
      status: "active",
    })).resolves.toMatchObject({ position: expect.objectContaining({ id: "pos_1" }) });
    expect(mocks.positionsRepository.createPosition).toHaveBeenCalledWith(expect.anything(), expect.any(String), "company_1", expect.objectContaining({ level: 3 }));

    expect(() => validatePositionCreateInput({ title: "Bad", department_id: "dept_1", level: 9 })).toThrow(/Level must be between 1 and 4/);

    mocks.positionsRepository.findPositionByCode.mockResolvedValueOnce(positionRecord({ id: "pos_existing" }));
    await expect(positionsService.createPosition(env, actor, { code: "SUP", title: "Duplicate", department_id: "dept_1", level: 2 }))
      .rejects.toThrow(/position code is already in use/i);

    mocks.positionsRepository.findPositionByCode.mockResolvedValueOnce(null);
    mocks.positionsRepository.findDepartment.mockResolvedValueOnce(null);
    await expect(positionsService.createPosition(env, actor, { code: "XCO", title: "Other Company", department_id: "dept_other", level: 2 }))
      .rejects.toThrow(/active department/i);

    mocks.positionsRepository.findPositionByCode.mockResolvedValueOnce(null);
    mocks.positionsRepository.findDepartment.mockResolvedValueOnce(departmentRecord({ status: "disabled", is_active: 0 }));
    await expect(positionsService.createPosition(env, actor, { code: "INA", title: "Inactive", department_id: "dept_1", level: 2 }))
      .rejects.toThrow(/active department/i);

    mocks.positionsRepository.findPositionById.mockResolvedValue(positionRecord());
    await positionsService.setPositionStatus(env, actor, "pos_1", "disabled", "Testing disable");
    await positionsService.setPositionStatus(env, actor, "pos_1", "active", "Testing enable");
    expect(mocks.positionsRepository.updatePosition).toHaveBeenCalledWith(expect.anything(), "company_1", "pos_1", expect.objectContaining({ status: "disabled" }));
    expect(mocks.positionsRepository.updatePosition).toHaveBeenCalledWith(expect.anything(), "company_1", "pos_1", expect.objectContaining({ status: "active" }));
  });

  it("assigns employee structure, derives level, writes history, closes previous history, and validates scope", async () => {
    const employee = {
      employee_id: "emp_1",
      employee_code: "E001",
      full_name: "Aisha",
      primary_outlet_id: "outlet_1",
      department_id: "dept_old",
      position_id: "pos_old",
      level: 2,
      linked_user_id: "user_emp",
    };
    mocks.structureRepository.findEmployeeStructure.mockResolvedValue(employee);
    mocks.structureRepository.findDepartment.mockResolvedValue(departmentRecord());
    mocks.structureRepository.findPosition.mockResolvedValue(positionRecord({ level: 4 }));

    await expect(structureService.updateEmployeeStructure(env, actor, "emp_1", {
      department_id: "dept_1",
      position_id: "pos_1",
      reason: "Promotion",
    })).resolves.toMatchObject({ structure: employee });

    expect(mocks.structureRepository.closeOpenStructureHistory).toHaveBeenCalledWith(expect.anything(), "company_1", "emp_1", expect.any(String));
    expect(mocks.structureRepository.updateEmployeeStructure).toHaveBeenCalledWith(expect.anything(), "company_1", "emp_1", expect.objectContaining({ level: 4 }));
    expect(mocks.structureRepository.createStructureHistory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      previousDepartmentId: "dept_old",
      previousPositionId: "pos_old",
      previousLevel: 2,
      newDepartmentId: "dept_1",
      newPositionId: "pos_1",
      newLevel: 4,
    }));

    mocks.structureRepository.findPosition.mockResolvedValueOnce(positionRecord({ department_id: "dept_other" }));
    await expect(structureService.updateEmployeeStructure(env, actor, "emp_1", { department_id: "dept_1", position_id: "pos_other" }))
      .rejects.toThrow(/different department/i);

    mocks.structureRepository.findPosition.mockResolvedValueOnce(positionRecord({ status: "disabled", is_active: 0 }));
    await expect(structureService.updateEmployeeStructure(env, actor, "emp_1", { department_id: "dept_1", position_id: "pos_1" }))
      .rejects.toThrow(/inactive or archived positions/i);

    mocks.structureRepository.findDepartment.mockResolvedValueOnce(null);
    await expect(structureService.updateEmployeeStructure(env, actor, "emp_1", { department_id: "dept_other_company", position_id: "pos_1" }))
      .rejects.toThrow(/valid department/i);

    mocks.permission.hasOutletAccess.mockReturnValueOnce(false);
    await expect(structureService.updateEmployeeStructure(env, actor, "emp_1", { department_id: "dept_1", position_id: "pos_1" }))
      .rejects.toThrow(/outlet/i);

    const employeeRoutes = read("src/routes/employees.routes.ts");
    expect(employeeRoutes).toMatch(/employees\.structure\.manage[\s\S]*updateEmployeeStructure/);
  });

  it("creates level role templates and rejects invalid, duplicate, and cross-company role references", async () => {
    const template = {
      id: "tpl_1",
      company_id: "company_1",
      level: 3,
      department_id: null,
      position_id: null,
      role_id: "role_supervisor",
      role_name: "Supervisor",
      is_default: 1,
      is_required: 0,
      archived_at: null,
    };
    mocks.structureRepository.findRole.mockResolvedValueOnce({ id: "role_supervisor" });
    mocks.structureRepository.findDuplicateTemplate.mockResolvedValueOnce(null);
    mocks.structureRepository.findLevelRoleTemplateById.mockResolvedValueOnce(template);

    await expect(structureService.createLevelRoleTemplate(env, actor, {
      level: 3,
      role_id: "role_supervisor",
      is_default: true,
      is_required: false,
    })).resolves.toMatchObject({ template });
    expect(mocks.structureRepository.createLevelRoleTemplate).toHaveBeenCalled();

    expect(() => validateLevelRoleTemplateInput({ level: 7, role_id: "role_supervisor" })).toThrow(/Level must be between 1 and 4/);

    mocks.structureRepository.findRole.mockResolvedValueOnce({ id: "role_supervisor" });
    mocks.structureRepository.findDuplicateTemplate.mockResolvedValueOnce(template);
    await expect(structureService.createLevelRoleTemplate(env, actor, { level: 3, role_id: "role_supervisor" }))
      .rejects.toThrow(/already exists/i);

    mocks.structureRepository.findRole.mockResolvedValueOnce(null);
    await expect(structureService.createLevelRoleTemplate(env, actor, { level: 2, role_id: "role_other_company" }))
      .rejects.toThrow(/valid role/i);
  });

  it("applies template roles to linked users without removing custom roles and audits the application", async () => {
    mocks.structureRepository.findEmployeeStructure.mockResolvedValue({
      employee_id: "emp_1",
      employee_code: "E001",
      full_name: "Aisha",
      primary_outlet_id: "outlet_1",
      department_id: "dept_1",
      position_id: "pos_1",
      level: 3,
      linked_user_id: "user_emp",
    });
    mocks.structureRepository.findTemplatesForStructure.mockResolvedValue([
      { role_id: "role_supervisor", role_name: "Supervisor" },
      { role_id: "role_custom", role_name: "Custom Existing" },
    ]);
    mocks.structureRepository.getUserRoleIds.mockResolvedValue([
      { role_id: "role_custom" },
      { role_id: "role_handcrafted_keep" },
    ]);

    const result = await structureService.applyLevelRoleTemplate(env, actor, "emp_1");

    expect(mocks.structureRepository.addUserRoles).toHaveBeenCalledWith(expect.anything(), "company_1", "user_emp", ["role_supervisor"]);
    expect(result).toMatchObject({
      roles_added: [{ role_id: "role_supervisor", role_name: "Supervisor" }],
      roles_skipped: [{ role_id: "role_custom", role_name: "Custom Existing", reason: "Already assigned" }],
    });
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "level_role_template_applied",
      entityId: "user_emp",
    }));
  });
});
