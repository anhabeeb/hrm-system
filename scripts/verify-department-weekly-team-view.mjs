import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustExist = (path) => {
  if (!existsSync(resolve(root, path))) failures.push(`${path} is missing.`);
};
const mustInclude = (label, path, token) => {
  const text = read(path);
  if (!text.includes(token)) failures.push(`${label} missing ${token}`);
};

[
  "src/modules/dashboard/department-weekly-team.service.ts",
  "src/modules/dashboard/department-weekly-team.repository.ts",
  "src/modules/dashboard/department-weekly-team.controller.ts",
  "src/modules/dashboard/department-weekly-team.types.ts",
  "frontend/src/features/department-dashboard/DepartmentDashboardPage.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyMatrix.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyDayCell.tsx",
  "frontend/src/features/department-dashboard/DepartmentDayDetailDrawer.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklySummaryWidgets.tsx",
  "frontend/src/features/department-dashboard/DepartmentTeamFilters.tsx",
  "frontend/src/features/department-dashboard/departmentWeeklyTeam.api.ts",
  "tests/department-weekly-team-view.test.ts",
].forEach(mustExist);

[
  ["department route", "src/routes/departments.routes.ts", '"/weekly-team-view"'],
  ["department route", "src/routes/departments.routes.ts", 'requireFeature("attendance")'],
  ["self-service route", "src/routes/self-service.routes.ts", '"/department-dashboard/weekly-team-view"'],
  ["self-service route employee module guard", "src/routes/self-service.routes.ts", 'requireFeature("employee_management"), requireFeature("attendance")'],
  ["self-service route", "src/routes/self-service.routes.ts", "requireLinkedEmployeeForSelfService"],
  ["scoped departments route", "src/routes/departments.routes.ts", '"/weekly-team-departments"'],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "resolveAllowedDepartmentsForActor"],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "assertCanViewDepartmentWeeklyTeam"],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "listWeeklyTeamDepartments"],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "buildWeekDays"],
  ["service holiday header", "src/modules/dashboard/department-weekly-team.service.ts", "is_holiday: filteredEmployees.some"],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "resolveTeamDayStatus"],
  ["service", "src/modules/dashboard/department-weekly-team.service.ts", "getWeeklyTeamSummary"],
  ["repository", "src/modules/dashboard/department-weekly-team.repository.ts", "COALESCE(e.level, 0) <"],
  ["repository", "src/modules/dashboard/department-weekly-team.repository.ts", "listDepartmentEmployeesForWeek"],
  ["repository scoped departments", "src/modules/dashboard/department-weekly-team.repository.ts", "listActiveDepartmentsForWeeklyTeam"],
  ["self-service navigation", "src/modules/self-service/self-service.service.ts", "featuresAll(features, [[\"employees\", \"employee_management\"], [\"attendance\"]])"],
  ["self-service navigation", "src/modules/self-service/self-service.service.ts", "\"departments.dashboard.viewTeam\""],
  ["self-service navigation", "src/modules/self-service/self-service.service.ts", "\"attendance.teamCalendar.view\""],
  ["frontend route", "frontend/src/app/router.tsx", "/departments/dashboard"],
  ["frontend route", "frontend/src/app/router.tsx", "/self/department-dashboard"],
  ["navigation", "frontend/src/lib/navigation.ts", "moduleCodesAll: [\"employees\", \"attendance\"]"],
  ["matrix", "frontend/src/features/department-dashboard/DepartmentWeeklyMatrix.tsx", "<table"],
  ["day cell", "frontend/src/features/department-dashboard/DepartmentWeeklyDayCell.tsx", "onOpen"],
  ["detail drawer", "frontend/src/features/department-dashboard/DepartmentDayDetailDrawer.tsx", "fixed inset-y-0 right-0"],
  ["api", "frontend/src/features/department-dashboard/departmentWeeklyTeam.api.ts", "/departments/weekly-team-view"],
  ["api scoped departments", "frontend/src/features/department-dashboard/departmentWeeklyTeam.api.ts", "/departments/weekly-team-departments"],
  ["frontend scoped selector", "frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx", "departmentWeeklyTeamApi.departments"],
  ["api", "frontend/src/features/department-dashboard/departmentWeeklyTeam.api.ts", "/self/department-dashboard/weekly-team-view"],
  ["permissions", "seeds/permissions.seed.sql", "departments.dashboard.viewTeam"],
  ["permissions", "seeds/permissions.seed.sql", "attendance.teamCalendar.view"],
  ["tests", "tests/department-weekly-team-view.test.ts", "leave/sick days are not marked absent"],
  ["tests", "tests/department-weekly-team-view.test.ts", "standalone Super Admin cannot use self-service department dashboard route"],
  ["tests", "tests/department-weekly-team-view.test.ts", "disabled Employee Management module blocks self-service weekly team route"],
  ["tests", "tests/department-weekly-team-view.test.ts", "holiday date marks week header"],
].forEach(([label, path, token]) => mustInclude(label, path, token));

const frontendSource = [
  "frontend/src/features/department-dashboard/DepartmentDashboardPage.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyMatrix.tsx",
  "frontend/src/features/department-dashboard/DepartmentWeeklyDayCell.tsx",
  "frontend/src/features/department-dashboard/DepartmentDayDetailDrawer.tsx",
].map(read).join("\n");
if (/window\.alert\s*\(|\balert\s*\(/.test(frontendSource)) failures.push("department weekly team view reintroduced browser alert().");
if (/window\.confirm\s*\(|\bconfirm\s*\(/.test(frontendSource)) failures.push("department weekly team view reintroduced browser confirm().");
if (/dark:\s*|darkMode|ThemeProvider/.test(frontendSource)) failures.push("department weekly team view introduced dark mode patterns.");
if (/drag|drop|onDrag|roster edit|create shift/i.test(frontendSource)) failures.push("department weekly team view appears to include roster editing/planning behavior.");

if (failures.length) {
  console.error("Department weekly team view verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Department weekly team view verification passed.");
