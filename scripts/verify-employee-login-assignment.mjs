import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const failures = [];

const mustInclude = (label, text, phrase) => {
  if (!text.includes(phrase)) failures.push(`${label} missing ${phrase}`);
};

const migration = read("migrations/0057_employee_login_assignment.sql");
for (const phrase of [
  "ALTER TABLE users ADD COLUMN username TEXT NULL",
  "idx_users_company_employee_unique",
  "WHERE employee_id IS NOT NULL",
  "idx_users_company_username_unique",
]) {
  mustInclude("employee login migration", migration, phrase);
}

const routes = read("src/routes/employees.routes.ts");
mustInclude("employees routes", routes, '"/:id/login"');
mustInclude("employees routes", routes, "employees.login.create");
mustInclude("employees routes", routes, "users.create");

const validators = read("src/modules/employees/employees.validators.ts");
for (const phrase of ["validateEmployeeLoginCreateInput", "temporary_password", "validateNewPassword", "role_id"]) {
  mustInclude("employee login validator", validators, phrase);
}

const service = read("src/modules/employees/employees.service.ts");
for (const phrase of [
  "createEmployeeLogin",
  "EMPLOYEE_ALREADY_HAS_LOGIN",
  "findUserByEmployeeId",
  "findUserByUsername",
  "hashPassword",
  "PASSWORD_HASH_ALGORITHM",
  "employee_login_created",
]) {
  mustInclude("employee login service", service, phrase);
}
if (/temporary_password[\s\S]{0,120}ensureAudit/.test(service)) {
  failures.push("employee login audit must not include temporary_password.");
}

const repository = read("src/modules/users/users.repository.ts");
for (const phrase of [
  "createEmployeeLoginUser",
  "password_hash",
  "password_reset_required",
  "employee_id",
  "username",
]) {
  mustInclude("users repository", repository, phrase);
}

const permissions = read("seeds/permissions.seed.sql");
for (const phrase of ["employees.login.view", "employees.login.create", "employees.login.link", "employees.login.revoke"]) {
  mustInclude("permission seed", permissions, phrase);
}

const employeeTypes = read("frontend/src/features/employees/employees.types.ts");
for (const phrase of ["has_login", "linked_user_id", "EmployeeLoginCreatePayload", "EmployeeLoginCreateResponse"]) {
  mustInclude("frontend employee types", employeeTypes, phrase);
}

const employeeApi = read("frontend/src/features/employees/employees.api.ts");
mustInclude("frontend employee api", employeeApi, "createLogin");
mustInclude("frontend employee api", employeeApi, "`/employees/${id}/login`");

const detailDrawer = read("frontend/src/features/employees/EmployeeDetailDrawer.tsx");
for (const phrase of ["Login Access", "Create Login", "Login Assigned", "linked_username", "linked_role_name"]) {
  mustInclude("employee detail drawer", detailDrawer, phrase);
}

const loginDialog = read("frontend/src/features/employees/EmployeeLoginDialog.tsx");
for (const phrase of [
  "Create Login for Employee",
  "temporary_password",
  "confirm_password",
  "Force password change on first login",
  "onSubmit",
]) {
  mustInclude("employee login dialog", loginDialog, phrase);
}
if (/InlineAlert|FormError/.test(loginDialog)) {
  failures.push("employee login dialog must use parent toasts, not inline page alerts.");
}

const employeesPage = read("frontend/src/features/employees/EmployeesPage.tsx");
for (const phrase of ["EmployeeLoginDialog", "toastSuccess", "toastError", "employees.login.create", "users.create"]) {
  mustInclude("employees page", employeesPage, phrase);
}

const usersTypes = read("frontend/src/features/users/users.types.ts");
for (const phrase of ["employee_id", "username", "employee_name", "employee_code"]) {
  mustInclude("frontend users types", usersTypes, phrase);
}

const tests = read("tests/employees.test.ts") + "\n" + read("tests/users-access.test.ts");
for (const phrase of [
  "create login for employee",
  "EMPLOYEE_ALREADY_HAS_LOGIN",
  "password is hashed",
  "Login Access",
  "EmployeeLoginDialog",
]) {
  mustInclude("employee login tests", tests, phrase);
}

if (failures.length > 0) {
  console.error("Employee login assignment verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee login assignment verification passed.");
