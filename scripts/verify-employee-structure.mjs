import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustExist = (path) => {
  if (!existsSync(resolve(root, path))) failures.push(`Missing ${path}`);
};
const mustInclude = (label, text, needle) => {
  if (needle instanceof RegExp) {
    if (!needle.test(text)) failures.push(`${label} is missing ${needle}`);
    return;
  }
  if (!text.includes(needle)) failures.push(`${label} is missing ${needle}`);
};

mustExist("migrations/0060_employee_structure_foundation.sql");
mustExist("src/routes/organization.routes.ts");
mustExist("src/modules/employee-structure/employee-structure.service.ts");
mustExist("frontend/src/features/organization/LevelRoleTemplatesPage.tsx");
mustExist("frontend/src/features/employees/EmployeeStructureDialog.tsx");

const migration = read("migrations/0060_employee_structure_foundation.sql");
[
  "CREATE TABLE IF NOT EXISTS access_levels",
  "CREATE TABLE IF NOT EXISTS level_role_templates",
  "CREATE TABLE IF NOT EXISTS employee_structure_history",
  "ALTER TABLE employees ADD COLUMN level",
  "ALTER TABLE employees ADD COLUMN structure_updated_at",
  "idx_employee_structure_history_company_employee",
  "Employee Self-Service",
  "Department Manager",
].forEach((token) => mustInclude("employee structure migration", migration, token));

const permissions = read("seeds/permissions.seed.sql");
[
  "organization.departments.view",
  "organization.departments.manage",
  "organization.positions.view",
  "organization.positions.manage",
  "organization.levels.view",
  "organization.levelRoleTemplates.view",
  "organization.levelRoleTemplates.manage",
  "employees.structure.view",
  "employees.structure.manage",
].forEach((permission) => mustInclude("permission seed", permissions, permission));

const app = read("src/app.ts");
mustInclude("app routes", app, 'apiV1.route("/organization", organizationRoutes)');

const orgRoutes = read("src/routes/organization.routes.ts");
[
  'organizationRoutes.get("/departments"',
  'organizationRoutes.post("/departments"',
  'organizationRoutes.get("/positions"',
  'organizationRoutes.post("/positions"',
  'organizationRoutes.get("/access-levels"',
  'organizationRoutes.get("/level-role-templates"',
  'organizationRoutes.post("/level-role-templates"',
  'organization.levelRoleTemplates.manage',
].forEach((token) => mustInclude("organization routes", orgRoutes, token));

const employeesRoutes = read("src/routes/employees.routes.ts");
[
  '/:id/structure',
  '/:id/structure-history',
  '/:id/apply-level-role-template',
  'employees.structure.manage',
].forEach((token) => mustInclude("employee structure routes", employeesRoutes, token));

const structureService = read("src/modules/employee-structure/employee-structure.service.ts");
[
  "position.department_id !== departmentId",
  "position.level",
  "closeOpenStructureHistory",
  "createStructureHistory",
  "applyLevelRoleTemplate",
  "addUserRoles",
  "level_role_template_applied",
].forEach((token) => mustInclude("employee structure service", structureService, token));

const employeesService = read("src/modules/employees/employees.service.ts");
mustInclude("employee service", employeesService, "generatedInput.level = position?.level ?? null");
mustInclude("employee service", employeesService, "merged.level = position?.level ?? null");
mustInclude("employee service", employeesService, "createStructureHistory");

const frontendPage = read("frontend/src/features/organization/LevelRoleTemplatesPage.tsx");
[
  "LevelRoleTemplatesPage",
  "Create Level Role Template",
  "organizationApi.levelRoleTemplates",
  "toastSuccess",
  "toastError",
].forEach((token) => mustInclude("level role templates page", frontendPage, token));

const employeeDialog = read("frontend/src/features/employees/EmployeeStructureDialog.tsx");
[
  "Update Employee Structure",
  "Level is derived from the selected position/title",
  "filteredPositions",
  "Derived level",
].forEach((token) => mustInclude("employee structure dialog", employeeDialog, token));

const employeeDetail = read("frontend/src/features/employees/EmployeeDetailDrawer.tsx");
mustInclude("employee detail drawer", employeeDetail, "Edit structure");
mustInclude("employee detail drawer", employeeDetail, "Apply level roles");

const navigation = read("frontend/src/lib/navigation.ts");
mustInclude("navigation", navigation, 'label: "Organization"');
mustInclude("navigation", navigation, "/organization/level-role-templates");

const forbiddenFrontend = [
  "frontend/src/features/organization/LevelRoleTemplatesPage.tsx",
  "frontend/src/features/employees/EmployeeStructureDialog.tsx",
].flatMap((path) => {
  const text = read(path);
  return ["window.alert(", "alert(", "window.confirm(", "confirm("].filter((token) => text.includes(token)).map((token) => `${path} contains ${token}`);
});
failures.push(...forbiddenFrontend);

if (failures.length > 0) {
  console.error("Employee structure verifier failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Employee structure verifier passed.");
