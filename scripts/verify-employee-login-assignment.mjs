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
for (const phrase of [
  '"/login-link-candidates"',
  '"/:id/login"',
  '"/:id/login/disable"',
  '"/:id/login/enable"',
  '"/:id/login/reset-password"',
  '"/:id/login/link-existing"',
  "employees.login.view",
  "employees.login.create",
  "employees.login.link",
  "employees.login.revoke",
  "users.create",
  "users.edit",
  "users.disable",
  "users.reset_password",
]) {
  mustInclude("employees routes", routes, phrase);
}

const validators = read("src/modules/employees/employees.validators.ts");
for (const phrase of [
  "validateEmployeeLoginCreateInput",
  "validateEmployeeLoginUpdateInput",
  "validateEmployeeLoginPasswordResetInput",
  "validateEmployeeLoginLinkExistingInput",
  "validateEmployeeLoginLinkCandidateFilters",
  "temporary_password",
  "validateNewPassword",
  "role_id",
  "EMPLOYEE_LOGIN_2FA_SETUP_UNSUPPORTED",
]) {
  mustInclude("employee login validator", validators, phrase);
}

const service = read("src/modules/employees/employees.service.ts");
for (const phrase of [
  "getEmployeeLogin",
  "createEmployeeLogin",
  "updateEmployeeLogin",
  "disableEmployeeLogin",
  "enableEmployeeLogin",
  "resetEmployeeLoginPassword",
  "linkExistingUserToEmployee",
  "listEmployeeLoginLinkCandidates",
  "EMPLOYEE_ALREADY_HAS_LOGIN",
  "USER_ALREADY_LINKED_TO_EMPLOYEE",
  "findUserByEmployeeId",
  "findUserByUsernameGlobally",
  "findUserByEmailGlobally",
  "hashPassword",
  "PASSWORD_HASH_ALGORITHM",
  "employee_login_created",
  "employee_login_disabled",
  "employee_login_enabled",
  "employee_login_password_reset",
  "employee_login_linked_existing_user",
  "revokeUserSessions",
  "LAST_SUPER_ADMIN_LOGIN",
]) {
  mustInclude("employee login service", service, phrase);
}
if (/temporary_password[\s\S]{0,120}ensureAudit/.test(service)) {
  failures.push("employee login audit must not include temporary_password.");
}
if (/require_2fa:\s*false/.test(service) || /require2fa/.test(service)) {
  failures.push("employee login service must not silently accept require_2fa and store/return false.");
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
if (/require2fa/.test(repository)) {
  failures.push("users repository must not expose an ignored require2fa input.");
}
const employeeRepository = read("src/modules/employees/employees.repository.ts");
for (const phrase of [
  "listLoginLinkCandidates",
  "countLoginLinkCandidates",
  "linked_user_email",
  "linked_password_reset_required",
  "linked_two_factor_enabled",
  "linked_last_login_at",
  "updateLinkedUserPassword",
  "linkExistingUserToEmployee",
  "enableLinkedUser",
]) {
  mustInclude("employees repository", employeeRepository, phrase);
}

const permissions = read("seeds/permissions.seed.sql");
for (const phrase of ["employees.login.view", "employees.login.create", "employees.login.link", "employees.login.revoke"]) {
  mustInclude("permission seed", permissions, phrase);
}

const employeeTypes = read("frontend/src/features/employees/employees.types.ts");
for (const phrase of ["has_login", "linked_user_id", "linked_user_email", "linked_password_reset_required", "EmployeeLoginCreatePayload", "EmployeeLoginUpdatePayload", "EmployeeLoginResetPasswordPayload", "EmployeeLoginLinkExistingPayload", "EmployeeLoginLinkCandidate"]) {
  mustInclude("frontend employee types", employeeTypes, phrase);
}
if (/password_hash|reset_token|session_token/.test(employeeTypes)) {
  failures.push("frontend employee login types must not expose password hash, reset token, or session token.");
}

const employeeApi = read("frontend/src/features/employees/employees.api.ts");
for (const phrase of ["login:", "loginLinkCandidates", "/employees/login-link-candidates", "createLogin", "updateLogin", "disableLogin", "enableLogin", "resetLoginPassword", "linkExistingLogin", "`/employees/${id}/login`"]) {
  mustInclude("frontend employee api", employeeApi, phrase);
}

const detailDrawer = read("frontend/src/features/employees/EmployeeDetailDrawer.tsx");
for (const phrase of ["Login Access", "Create Login", "Link Existing User", "Edit login", "Disable login", "Enable login", "Reset password", "linked_username", "linked_user_email", "linked_role_name", "linked_password_reset_required", "linked_two_factor_enabled"]) {
  mustInclude("employee detail drawer", detailDrawer, phrase);
}

const loginDialog = read("frontend/src/features/employees/EmployeeLoginDialog.tsx");
for (const phrase of [
  "Create Login for Employee",
  "Edit Employee Login",
  "Reset Employee Login Password",
  "Link Existing User",
  "Search existing users",
  "No available unlinked users found.",
  "loginLinkCandidates",
  "temporary_password",
  "confirm_password",
  "Force password change on first login",
  "onSubmit",
  "Two-factor authentication is configured after first sign-in",
]) {
  mustInclude("employee login dialog", loginDialog, phrase);
}
if (/InlineAlert|FormError|window\.alert/.test(loginDialog)) {
  failures.push("employee login dialog must use parent toasts, not inline page alerts.");
}
if (/Existing user ID/.test(loginDialog)) {
  failures.push("employee login link-existing dialog must not ask admins to type raw internal user IDs.");
}

const employeesPage = read("frontend/src/features/employees/EmployeesPage.tsx");
for (const phrase of ["EmployeeLoginDialog", "toastSuccess", "toastError", "employees.login.create", "employees.login.link", "employees.login.revoke", "users.create", "canCreateLogin", "canEditLogin", "canDisableLogin", "canEnableLogin", "canResetLoginPassword", "canLinkExistingLogin", "updateLoginMutation", "disableLoginMutation", "enableLoginMutation", "resetLoginPasswordMutation", "linkExistingLoginMutation"]) {
  mustInclude("employees page", employeesPage, phrase);
}
if (/const canManageLogin/.test(employeesPage)) {
  failures.push("employees page must use action-specific employee login permission flags, not one broad canManageLogin flag.");
}
if (/usersApi\.list\(\{\s*page_size:\s*100\s*\}\)/.test(employeesPage) || /from "@\/features\/users\/users\.api"/.test(employeesPage)) {
  failures.push("employees page must use the scoped employee login link candidate endpoint, not broad usersApi.list.");
}

const viteConfig = read("frontend/vite.config.ts");
for (const phrase of ["minify: false", "minification pass"]) {
  mustInclude("frontend vite config", viteConfig, phrase);
}
const frontendPackage = read("frontend/package.json");
const frontendBuildScript = read("frontend/scripts/build.mjs");
const frontendTypecheckScript = read("frontend/scripts/typecheck.mjs");
mustInclude("frontend package build", frontendPackage, '"build": "node ./scripts/build.mjs"');
mustInclude("frontend package typecheck", frontendPackage, '"typecheck": "node ./scripts/typecheck.mjs"');
mustInclude("frontend build script", frontendBuildScript, 'await run("frontend typecheck"');
mustInclude("frontend build script", frontendBuildScript, 'await run("vite build"');
mustInclude("frontend build script", frontendBuildScript, "shell: false");
mustInclude("frontend typecheck script", frontendTypecheckScript, "--noEmit");
mustInclude("frontend typecheck script", frontendTypecheckScript, "--project");
mustInclude("frontend typecheck script", frontendTypecheckScript, "shell: false");

const authRepository = read("src/modules/auth/auth.repository.ts");
for (const phrase of ["findUserByLoginIdentifier", "COUNT(DISTINCT ux.id)", "ux.email", "ux.username", ") = 1"]) {
  mustInclude("auth username lookup", authRepository, phrase);
}
const authValidators = read("src/modules/auth/auth.validators.ts");
for (const phrase of ["identifier", "Username or email is required.", "value.identifier ?? value.email"]) {
  mustInclude("auth login validator", authValidators, phrase);
}
const authService = read("src/modules/auth/auth.service.ts");
for (const phrase of ["findUserByLoginIdentifier", "input.identifier ?? input.email", "hasActiveLinkedEmployee"]) {
  mustInclude("auth login service", authService, phrase);
}
const usersService = read("src/modules/users/users.service.ts");
for (const phrase of ["findUserByUsernameGlobally", "findUserByEmailGlobally"]) {
  mustInclude("users global login uniqueness", usersService, phrase);
}

const loginPage = read("frontend/src/features/auth/LoginPage.tsx");
for (const phrase of ['name="identifier"', "Username or email", "Enter your username or email", "identifier: values.identifier.trim()"]) {
  mustInclude("frontend login page", loginPage, phrase);
}
if (/name="email"|placeholder="name@company\.com"/.test(loginPage)) {
  failures.push("frontend login page must use one username-or-email identifier field, not an email-only field.");
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
  "disable, enable, reset password, and link existing login execute real service paths",
  "rejects require_2fa instead of silently ignoring it",
  "Search existing users",
  "login link candidates are safe",
  "loginLinkCandidates",
  "canResetLoginPassword",
  "minify: false",
  "COUNT(DISTINCT ux.id)",
  "DUPLICATE_USERNAME",
  "DUPLICATE_USER_EMAIL",
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
