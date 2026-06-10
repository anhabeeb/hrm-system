import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  validateEmployeeCreateInput,
  validateEmployeeLoginCreateInput,
  validateEmployeeUpdateInput,
  validateSalaryHistoryInput,
} from "../src/modules/employees/employees.validators";
import * as employeesService from "../src/modules/employees/employees.service";
import { verifyPassword } from "../src/services/password.service";
import type { AuthActor } from "../src/types/api.types";
import { AppError } from "../src/utils/errors";

const startingSalary = {
  amount: 750000,
  salary_type: "monthly",
  currency: "MVR",
  effective_from: "2026-05-01",
  reason: "Starting salary",
};

const source = (path: string) => readFileSync(path, "utf8");

describe("employee validators", () => {
  it("accepts a local employee without creating any user login data", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      starting_salary: startingSalary,
    });

    expect(input.employee_code).toBeUndefined();
    expect(input.id_card_number).toBe("A123456");
    expect("password" in input).toBe(false);
  });

  it("requires starting salary during employee creation", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
      }),
    ).toThrow(AppError);

    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("STARTING_SALARY_REQUIRED");
      expect((error as AppError).fieldErrors?.["starting_salary.amount"]).toBe("Starting salary is required.");
    }
  });

  it("defaults starting salary effective date to joining date and currency to MVR", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      starting_salary: {
        amount: 750000,
      },
    });

    expect(input.starting_salary.monthly_salary_amount).toBe(750000);
    expect(input.starting_salary.effective_from).toBe("2026-05-01");
    expect(input.starting_salary.currency).toBe("MVR");
    expect(input.starting_salary.salary_type).toBe("monthly");
  });

  it("accepts and trims optional emergency contact relationship fields on create", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      emergency_contact_name: "  Fathimath Ali  ",
      emergency_contact_phone: "  +9607111111  ",
      emergency_contact_relation: "  Guardian  ",
      starting_salary: startingSalary,
    });

    expect(input.emergency_contact_name).toBe("Fathimath Ali");
    expect(input.emergency_contact_phone).toBe("+9607111111");
    expect(input.emergency_contact_relation).toBe("Guardian");
  });

  it("allows null emergency contact relationship on create and update", () => {
    const created = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      emergency_contact_relation: null,
      starting_salary: startingSalary,
    });
    const updated = validateEmployeeUpdateInput({ emergency_contact_relation: null });

    expect(created.emergency_contact_relation).toBeNull();
    expect(updated.emergency_contact_relation).toBeNull();
  });

  it("rejects invalid starting salary amount with a field error", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 0,
        },
      }),
    ).toThrow(AppError);

    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 0,
        },
      });
    } catch (error) {
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.["starting_salary.amount"]).toContain("positive amount");
    }
  });

  it("rejects unsupported salary type", () => {
    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 750000,
          salary_type: "daily",
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_TYPE");
      expect((error as AppError).fieldErrors?.["starting_salary.salary_type"]).toBe("Select a valid salary type.");
    }
  });

  it("requires National ID for local employees", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Local Employee",
        employee_type: "local",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        starting_salary: startingSalary,
      }),
    ).toThrow("National ID number is required for local employees.");
  });

  it("requires nationality, passport, and work permit details for foreign employees", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Foreign Employee",
        employee_type: "foreign",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        starting_salary: startingSalary,
      }),
    ).toThrow("Please complete the required foreign employee identity fields.");
  });

  it("accepts complete foreign employee identity details", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Foreign Employee",
      employee_type: "foreign",
      nationality: "Sri Lankan",
      passport_number: "n1234567",
      passport_expiry_date: "2028-06-01",
      work_permit_number: "wp-9988",
      work_permit_expiry_date: "2027-06-01",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      starting_salary: startingSalary,
    });

    expect(input.passport_number).toBe("n1234567");
    expect(input.work_permit_number).toBe("wp-9988");
  });

  it("normalizes blank identity strings to null", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: " A123456 ",
      passport_number: "   ",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      starting_salary: startingSalary,
    });

    expect(input.id_card_number).toBe("A123456");
    expect(input.passport_number).toBeNull();
  });

  it("rejects employee code changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        employee_code: "EMP-999999",
      }),
    ).toThrow("Employee ID is system-generated and cannot be changed here.");
  });

  it("requires salary values to be integer minor units", () => {
    expect(() =>
      validateSalaryHistoryInput({
        monthly_salary_amount: 1000.5,
        effective_from: "2026-06-01",
        change_type: "increment",
        reason: "Salary setup",
      }),
    ).toThrow(AppError);
  });

  it("accepts a salary increment with integer minor units and normalized currency", () => {
    const input = validateSalaryHistoryInput({
      monthly_salary_amount: 850000,
      currency: "mvr",
      effective_from: "2026-07-01",
      change_type: "increment",
      reason: "Annual salary increment after performance review",
    });

    expect(input.monthly_salary_amount).toBe(850000);
    expect(input.currency).toBe("MVR");
    expect(input.change_type).toBe("increment");
  });

  it("returns salary-specific field errors for invalid increment amount", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 0,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.monthly_salary_amount).toBe("Salary amount must be greater than zero.");
    }
  });

  it("rejects negative salary amounts", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: -1,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.monthly_salary_amount).toBe("Salary amount must be greater than zero.");
    }
  });

  it("defaults salary change currency to MVR when omitted", () => {
    const input = validateSalaryHistoryInput({
      monthly_salary_amount: 850000,
      effective_from: "2026-07-01",
      change_type: "increment",
      reason: "Annual salary increment",
    });

    expect(input.currency).toBe("MVR");
  });

  it("rejects invalid salary currency codes", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        currency: "MVRF",
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION_ERROR");
      expect((error as AppError).fieldErrors?.currency).toBe("Please enter a valid currency code.");
    }
  });

  it("requires a valid salary effective date", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-99-99",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_EFFECTIVE_DATE");
      expect((error as AppError).fieldErrors?.effective_from).toBe("Please enter a valid effective date.");
    }
  });

  it("requires a supported salary change type", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-07-01",
        change_type: "promotion",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_CHANGE_TYPE");
      expect((error as AppError).fieldErrors?.change_type).toBe("Select a valid salary change type.");
    }
  });

  it("requires a salary change reason", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("SALARY_CHANGE_REASON_REQUIRED");
      expect((error as AppError).fieldErrors?.reason).toBe("Reason is required.");
    }
  });

  it("rejects employment status changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        employment_status: "terminated",
      }),
    ).toThrow(AppError);
  });

  it("rejects resigned date changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        resigned_at: "2026-06-01",
      }),
    ).toThrow("Employee status changes must be made through the status action.");
  });

  it("rejects terminated date changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        terminated_at: "2026-06-01",
      }),
    ).toThrow("Employee status changes must be made through the status action.");
  });

  it("rejects primary outlet changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        primary_outlet_id: "outlet_2",
      }),
    ).toThrow("Employee outlet changes must be made through the outlet assignment action.");
  });
});

describe("employee emergency contact wiring", () => {
  it("migration adds nullable emergency_contact_relation to employees", () => {
    const migration = source("migrations/0056_employee_emergency_contact_relation.sql");
    expect(migration).toContain("ALTER TABLE employees ADD COLUMN emergency_contact_relation TEXT");
  });

  it("repository persists emergency_contact_relation on create and update", () => {
    const repository = source("src/modules/employees/employees.repository.ts");
    expect(repository).toContain("emergency_contact_phone, emergency_contact_relation, primary_outlet_id");
    expect(repository).toContain("emergency_contact_phone = ?, emergency_contact_relation = ?");
    expect(repository).toContain("input.emergency_contact_relation ?? null");
  });

  it("EmployeeForm includes a compact Emergency Contact relationship field", () => {
    const form = source("frontend/src/features/employees/EmployeeForm.tsx");
    expect(form).toContain("Emergency Contact");
    expect(form).toContain('name="emergency_contact_relation"');
    expect(form).toContain("Relationship");
    expect(form).not.toContain("dark:");
  });

  it("Employee detail and 360 pages display emergency contact relation and empty state", () => {
    const drawer = source("frontend/src/features/employees/EmployeeDetailDrawer.tsx");
    const profile = source("frontend/src/features/employees/Employee360Page.tsx");
    expect(drawer).toContain("Emergency Contact");
    expect(drawer).toContain("emergency_contact_relation");
    expect(drawer).toContain("No emergency contact recorded.");
    expect(profile).toContain("Emergency Contact");
    expect(profile).toContain("emergency_contact_relation");
    expect(profile).toContain("No emergency contact recorded.");
    expect(drawer).not.toContain("dark:");
    expect(profile).not.toContain("dark:");
  });
});

describe("employee login assignment wiring", () => {
  it("create login for employee validates username, role, and password policy", () => {
    const input = validateEmployeeLoginCreateInput({
      username: "ahmed.ali",
      email: "AHMED@example.com",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
      store_ids: ["outlet_1"],
    });

    expect(input.username).toBe("ahmed.ali");
    expect(input.email).toBe("ahmed@example.com");
    expect(input.force_password_change).toBe(true);
    expect(input.store_ids).toEqual(["outlet_1"]);
  });

  it("rejects weak temporary password before user creation", () => {
    expect(() =>
      validateEmployeeLoginCreateInput({
        username: "weak.user",
        temporary_password: "password",
        role_id: "role_employee",
      }),
    ).toThrow(AppError);
  });

  it("rejects require_2fa instead of silently ignoring it", () => {
    expect(() =>
      validateEmployeeLoginCreateInput({
        username: "two.factor",
        temporary_password: "StrongPass123",
        role_id: "role_employee",
        require_2fa: true,
      }),
    ).toThrow("Two-factor authentication is configured by the user after their first sign-in.");
  });

  it("employee login backend creates a linked user, password is hashed, and duplicate login is blocked", () => {
    const migration = source("migrations/0057_employee_login_assignment.sql");
    const routes = source("src/routes/employees.routes.ts");
    const service = source("src/modules/employees/employees.service.ts");
    const repository = source("src/modules/users/users.repository.ts");
    const authRepository = source("src/modules/auth/auth.repository.ts");

    expect(migration).toContain("idx_users_company_employee_unique");
    expect(routes).toContain('"/:id/login"');
    expect(routes).toContain("employees.login.create");
    expect(service).toContain("EMPLOYEE_ALREADY_HAS_LOGIN");
    expect(service).toContain("findUserByEmployeeId");
    expect(service).toContain("hashPassword(input.temporary_password");
    expect(service).toContain("employee_login_created");
    expect(repository).toContain("createEmployeeLoginUser");
    expect(repository).toContain("password_hash");
    expect(authRepository).toContain("findUserByLoginIdentifier");
    expect(authRepository).toContain("COUNT(DISTINCT ux.id)");
    expect(authRepository).toContain("ux.email");
    expect(authRepository).toContain("ux.username");
    expect(service).toContain("findUserByUsernameGlobally");
    expect(service).toContain("findUserByEmailGlobally");
    expect(service).not.toMatch(/temporary_password[\s\S]{0,120}ensureAudit/);
    expect(routes).toContain("/login-link-candidates");
    expect(routes).toContain("employees.login.link");
    expect(routes).toContain("users.edit");
    expect(service).toContain("listEmployeeLoginLinkCandidates");
  });

  it("employee detail, Employee 360, and list expose Login Access status without inline alert workflow", () => {
    const drawer = source("frontend/src/features/employees/EmployeeDetailDrawer.tsx");
    const profile = source("frontend/src/features/employees/Employee360Page.tsx");
    const list = source("frontend/src/features/employees/EmployeeList.tsx");
    const dialog = source("frontend/src/features/employees/EmployeeLoginDialog.tsx");
    const page = source("frontend/src/features/employees/EmployeesPage.tsx");

    expect(drawer).toContain("Login Access");
    expect(drawer).toContain("Create Login");
    expect(drawer).toContain("Login Assigned");
    expect(profile).toContain("Login Access");
    expect(list).toContain("Login Assigned");
    expect(dialog).toContain("Create Login for Employee");
    expect(dialog).toContain("temporary_password");
    expect(dialog).toContain("confirm_password");
    expect(dialog).not.toContain("InlineAlert");
    expect(page).toContain("toastSuccess");
    expect(page).toContain("toastError");
  });
});

type FakeUser = {
  id: string;
  company_id: string;
  employee_id: string | null;
  username: string | null;
  full_name: string;
  email: string | null;
  password_hash: string | null;
  password_algo: string | null;
  password_reset_required: number;
  two_factor_enabled: number;
  status: string;
  last_login_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

const employeeLoginActor = (outletIds = ["outlet_1"]): AuthActor => ({
  actorUserId: "user_admin",
  companyId: "company_1",
  fullName: "HR Admin",
  email: "hr@example.com",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "employees.view",
    "employees.login.view",
    "employees.login.create",
    "employees.login.link",
    "employees.login.revoke",
    "users.create",
    "users.edit",
    "users.disable",
    "users.reset_password",
  ],
  outletIds,
  isSuperAdmin: outletIds.length === 0,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
  requestId: "req_test",
});

const makeEmployeeLoginEnv = (options: {
  employee?: Partial<Record<string, unknown>>;
  users?: FakeUser[];
  sessions?: Array<{ id: string; user_id: string; revoked_at: string | null }>;
} = {}) => {
  const state = {
    employee: {
      id: "emp_1",
      company_id: "company_1",
      employee_code: "EMP-001",
      full_name: "Aisha Hassan",
      employee_type: "local",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      deleted_at: null,
      id_card_number: "A123456",
      passport_number: null,
      work_permit_number: null,
      bank_name: null,
      document_expiry_status: null,
      ...options.employee,
    } as Record<string, unknown>,
    users: [...(options.users ?? [])],
    userRoles: [] as Array<{ user_id: string; role_id: string }>,
    userOutlets: [] as Array<{ user_id: string; outlet_id: string }>,
    sessions: [...(options.sessions ?? [])],
    audits: [] as Array<{ action: string; newValueJson: string | null }>,
  };
  const roles = [
    { id: "role_employee", role_key: "employee", role_name: "Employee" },
    { id: "role_admin", role_key: "super_admin", role_name: "Super Admin" },
  ];
  const outlets = [
    { id: "outlet_1", name: "Main Outlet" },
    { id: "outlet_2", name: "Other Outlet" },
  ];

  const first = (sql: string, values: unknown[]) => {
    const normalized = sql.toLowerCase();
    if (normalized.includes("from employees e")) {
      return state.employee.company_id === values[0] && state.employee.id === values[1] ? state.employee : null;
    }
    if (normalized.includes("from users") && normalized.includes("employee_id = ?")) {
      return state.users.find((user) => user.company_id === values[0] && user.employee_id === values[1] && !user.deleted_at) ?? null;
    }
    if (normalized.includes("from users") && normalized.includes("lower(username)")) {
      const username = String(values[normalized.includes("company_id = ?") ? 1 : 0]).toLowerCase();
      return state.users.find((user) =>
        (!normalized.includes("company_id = ?") || user.company_id === values[0]) &&
        user.username?.toLowerCase() === username &&
        !user.deleted_at
      ) ?? null;
    }
    if (normalized.includes("from users") && normalized.includes("lower(email)")) {
      const email = String(values[normalized.includes("company_id = ?") ? 1 : 0]).toLowerCase();
      return state.users.find((user) =>
        (!normalized.includes("company_id = ?") || user.company_id === values[0]) &&
        user.email?.toLowerCase() === email &&
        !user.deleted_at
      ) ?? null;
    }
    if (normalized.includes("from users") && normalized.includes("id = ?")) {
      return state.users.find((user) => user.company_id === values[0] && user.id === values[1] && !user.deleted_at) ?? null;
    }
    if (normalized.includes("from users u") && normalized.includes("left join employees e") && normalized.includes("count(*) as total")) {
      const companyId = String(values[0]);
      const employeeId = normalized.includes("u.employee_id is null or u.employee_id = ?") ? String(values[1]) : null;
      const searchValue = values.find((value) => typeof value === "string" && value.startsWith("%") && value.endsWith("%"));
      const search = searchValue ? String(searchValue).replaceAll("%", "").toLowerCase() : "";
      const total = state.users.filter((user) => {
        if (user.company_id !== companyId || user.deleted_at) return false;
        if (employeeId ? user.employee_id && user.employee_id !== employeeId : user.employee_id) return false;
        if (!search) return true;
        return [user.full_name, user.username, user.email].some((value) => value?.toLowerCase().includes(search));
      }).length;
      return { total };
    }
    if (normalized.includes("count(distinct u.id) as total")) {
      const excludeUserId = values[1];
      const total = state.users.filter((user) => user.company_id === values[0] && user.id !== excludeUserId && user.status === "active" && state.userRoles.some((role) => role.user_id === user.id && role.role_id === "role_admin")).length;
      return { total };
    }
    return null;
  };

  const all = (sql: string, values: unknown[]) => {
    const normalized = sql.toLowerCase();
    if (normalized.includes("from roles") && normalized.includes("id in")) {
      const ids = values.slice(1).map(String);
      return roles.filter((role) => ids.includes(role.id));
    }
    if (normalized.includes("from outlets") && normalized.includes("id in")) {
      const ids = values.slice(1).map(String);
      return outlets.filter((outlet) => ids.includes(outlet.id));
    }
    if (normalized.includes("from user_roles ur")) {
      const userIds = values.slice(1).map(String);
      return state.userRoles
        .filter((assignment) => userIds.includes(assignment.user_id))
        .map((assignment) => {
          const role = roles.find((candidate) => candidate.id === assignment.role_id)!;
          return { user_id: assignment.user_id, role_id: role.id, role_name: role.role_name, role_key: role.role_key };
        });
    }
    if (normalized.includes("from user_outlets")) {
      const userIds = values.slice(1, -1).map(String);
      return state.userOutlets
        .filter((assignment) => userIds.includes(assignment.user_id))
        .map((assignment) => ({ user_id: assignment.user_id, outlet_id: assignment.outlet_id, outlet_name: outlets.find((outlet) => outlet.id === assignment.outlet_id)?.name ?? null }));
    }
    if (normalized.includes("from users u") && normalized.includes("left join employees e") && normalized.includes("linked_status")) {
      const employeeId = String(values[0]);
      const companyId = String(values[1]);
      const searchValue = values.find((value, index) => index > 1 && typeof value === "string" && value.startsWith("%") && value.endsWith("%"));
      const search = searchValue ? String(searchValue).replaceAll("%", "").toLowerCase() : "";
      const limit = Number(values.at(-2) ?? 20);
      const offset = Number(values.at(-1) ?? 0);
      return state.users
        .filter((user) => {
          if (user.company_id !== companyId || user.deleted_at) return false;
          if (user.employee_id && user.employee_id !== employeeId) return false;
          if (!search) return true;
          return [user.full_name, user.username, user.email].some((value) => value?.toLowerCase().includes(search));
        })
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .slice(offset, offset + limit)
        .map((user) => ({
          id: user.id,
          full_name: user.full_name,
          username: user.username,
          email: user.email,
          status: user.status,
          employee_id: user.employee_id,
          employee_name: user.employee_id === employeeId ? String(state.employee.full_name) : null,
          employee_code: user.employee_id === employeeId ? String(state.employee.employee_code) : null,
          linked_status: user.employee_id === employeeId ? "linked_to_current_employee" : "available",
        }));
    }
    return [];
  };

  const run = (sql: string, values: unknown[]) => {
    const normalized = sql.toLowerCase();
    if (normalized.startsWith("insert into users")) {
      state.users.push({
        id: String(values[0]),
        company_id: String(values[1]),
        employee_id: String(values[2]),
        username: String(values[3]),
        full_name: String(values[4]),
        email: values[5] === null ? null : String(values[5]),
        password_hash: String(values[6]),
        password_algo: String(values[7]),
        password_reset_required: Number(values[9]),
        two_factor_enabled: Number(values[10]),
        status: String(values[11]),
        last_login_at: null,
        deleted_at: null,
        created_at: String(values[12]),
        updated_at: String(values[13]),
      });
    } else if (normalized.startsWith("insert into user_roles")) {
      state.userRoles.push({ user_id: String(values[2]), role_id: String(values[3]) });
    } else if (normalized.startsWith("insert into user_outlets")) {
      state.userOutlets.push({ user_id: String(values[2]), outlet_id: String(values[3]) });
    } else if (normalized.startsWith("insert into audit_logs")) {
      state.audits.push({ action: String(values[4]), newValueJson: values[15] === null ? null : String(values[15]) });
    } else if (normalized.startsWith("delete from user_roles")) {
      state.userRoles = state.userRoles.filter((assignment) => !(assignment.user_id === values[1] && state.users.some((user) => user.company_id === values[0] && user.id === assignment.user_id)));
    } else if (normalized.startsWith("delete from user_outlets")) {
      state.userOutlets = state.userOutlets.filter((assignment) => !(assignment.user_id === values[1] && state.users.some((user) => user.company_id === values[0] && user.id === assignment.user_id)));
    } else if (normalized.includes("update users set status = 'disabled'")) {
      const user = state.users.find((candidate) => candidate.company_id === values[1] && candidate.id === values[2]);
      if (user) user.status = "disabled";
    } else if (normalized.includes("update users set status = 'active'")) {
      const user = state.users.find((candidate) => candidate.company_id === values[1] && candidate.id === values[2]);
      if (user) user.status = "active";
    } else if (normalized.startsWith("update users set username")) {
      const user = state.users.find((candidate) => candidate.company_id === values[4] && candidate.id === values[5]);
      if (user) {
        user.username = values[0] === null ? null : String(values[0]);
        user.email = values[1] === null ? null : String(values[1]);
        user.status = String(values[2]);
      }
    } else if (normalized.startsWith("update users") && normalized.includes("password_hash")) {
      const user = state.users.find((candidate) => candidate.company_id === values[6] && candidate.id === values[7]);
      if (user) {
        user.password_hash = String(values[0]);
        user.password_algo = String(values[1]);
        user.password_reset_required = Number(values[4]);
      }
    } else if (normalized.startsWith("update users set employee_id")) {
      const user = state.users.find((candidate) => candidate.company_id === values[2] && candidate.id === values[3]);
      if (user) user.employee_id = String(values[0]);
    } else if (normalized.startsWith("update sessions set revoked_at")) {
      state.sessions
        .filter((session) => session.user_id === values[2] && session.revoked_at === null)
        .forEach((session) => {
          session.revoked_at = String(values[0]);
        });
    }
    return { success: true };
  };

  const prepare = (sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      first<T>() {
        return Promise.resolve(first(this.sql, this.values) as T | null);
      },
      all<T>() {
        return Promise.resolve({ results: all(this.sql, this.values) as T[] });
      },
      run() {
        return Promise.resolve(run(this.sql, this.values));
      },
    };
    return statement;
  };

  return {
    env: {
      PASSWORD_PEPPER: "pepper",
      DB: {
        prepare,
        batch: async (statements: Array<ReturnType<typeof prepare>>) => {
          for (const statement of statements) await statement.run();
          return statements.map(() => ({ success: true }));
        },
      },
    } as unknown as Env,
    state,
  };
};

describe("employee login assignment behavior", () => {
  it("create employee login creates a linked user, hashed password, role, outlets, and safe audit", async () => {
    const { env, state } = makeEmployeeLoginEnv();
    const result = await employeesService.createEmployeeLogin(env, employeeLoginActor(), "emp_1", validateEmployeeLoginCreateInput({
      username: "aisha",
      email: "aisha@example.com",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
      store_ids: ["outlet_1"],
    }));

    const user = state.users.find((row) => row.id === result.user_id)!;
    expect(user.employee_id).toBe("emp_1");
    expect(user.username).toBe("aisha");
    expect(user.password_hash).not.toBe("StrongPass123");
    expect(await verifyPassword("StrongPass123", user.password_hash, "pepper")).toBe(true);
    expect(state.userRoles).toEqual([{ user_id: user.id, role_id: "role_employee" }]);
    expect(state.userOutlets).toEqual([{ user_id: user.id, outlet_id: "outlet_1" }]);
    expect(state.audits.at(-1)?.action).toBe("employee_login_created");
    expect(state.audits.at(-1)?.newValueJson).not.toContain("temporary_password");
  });

  it("blocks duplicate employee login, duplicate username, duplicate email, archived employee, and out-of-scope outlet", async () => {
    const existing = { id: "user_existing", company_id: "company_1", employee_id: "emp_1", username: "aisha", full_name: "Aisha", email: "aisha@example.com", password_hash: "hash", password_algo: "pbkdf2_sha256", password_reset_required: 1, two_factor_enabled: 0, status: "active", last_login_at: null, deleted_at: null, created_at: "", updated_at: "" };
    await expect(employeesService.createEmployeeLogin(makeEmployeeLoginEnv({ users: [existing] }).env, employeeLoginActor(), "emp_1", validateEmployeeLoginCreateInput({
      username: "new.user",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
    }))).rejects.toMatchObject({ code: "EMPLOYEE_ALREADY_HAS_LOGIN" });

    await expect(employeesService.createEmployeeLogin(makeEmployeeLoginEnv({ users: [{ ...existing, employee_id: null }] }).env, employeeLoginActor(), "emp_1", validateEmployeeLoginCreateInput({
      username: "aisha",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
    }))).rejects.toMatchObject({ code: "DUPLICATE_USERNAME" });

    await expect(employeesService.createEmployeeLogin(makeEmployeeLoginEnv({ users: [{ ...existing, employee_id: null, username: "other" }] }).env, employeeLoginActor(), "emp_1", validateEmployeeLoginCreateInput({
      username: "new.user",
      email: "aisha@example.com",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
    }))).rejects.toMatchObject({ code: "DUPLICATE_USER_EMAIL" });

    await expect(employeesService.createEmployeeLogin(makeEmployeeLoginEnv({ employee: { employment_status: "archived" } }).env, employeeLoginActor(), "emp_1", validateEmployeeLoginCreateInput({
      username: "new.user",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
    }))).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });

    await expect(employeesService.createEmployeeLogin(makeEmployeeLoginEnv().env, employeeLoginActor(["outlet_1"]), "emp_1", validateEmployeeLoginCreateInput({
      username: "new.user",
      temporary_password: "StrongPass123",
      role_id: "role_employee",
      store_ids: ["outlet_2"],
    }))).rejects.toThrow("outside your outlet scope");
  });

  it("disable, enable, reset password, and link existing login execute real service paths", async () => {
    const linkedUser = { id: "user_linked", company_id: "company_1", employee_id: "emp_1", username: "aisha", full_name: "Aisha", email: "aisha@example.com", password_hash: "old_hash", password_algo: "pbkdf2_sha256", password_reset_required: 0, two_factor_enabled: 0, status: "active", last_login_at: null, deleted_at: null, created_at: "", updated_at: "" };
    const { env, state } = makeEmployeeLoginEnv({ users: [linkedUser], sessions: [{ id: "sess_1", user_id: "user_linked", revoked_at: null }] });
    state.userRoles.push({ user_id: "user_linked", role_id: "role_employee" });
    state.userOutlets.push({ user_id: "user_linked", outlet_id: "outlet_1" });

    await employeesService.disableEmployeeLogin(env, employeeLoginActor(), "emp_1");
    expect(state.users[0]?.status).toBe("disabled");
    expect(state.sessions[0]?.revoked_at).toBeTruthy();

    await employeesService.enableEmployeeLogin(env, employeeLoginActor(), "emp_1");
    expect(state.users[0]?.status).toBe("active");

    await employeesService.resetEmployeeLoginPassword(env, employeeLoginActor(), "emp_1", {
      temporary_password: "AnotherPass123",
      force_password_change: true,
    });
    expect(state.users[0]?.password_hash).not.toBe("AnotherPass123");
    expect(state.users[0]?.password_reset_required).toBe(1);
    expect(await verifyPassword("AnotherPass123", state.users[0]?.password_hash ?? null, "pepper")).toBe(true);

    const unlinked = { ...linkedUser, id: "user_unlinked", employee_id: null, username: "unlinked", email: "unlinked@example.com", status: "active" };
    const linkCase = makeEmployeeLoginEnv({ users: [unlinked] });
    await employeesService.linkExistingUserToEmployee(linkCase.env, employeeLoginActor(), "emp_1", {
      user_id: "user_unlinked",
      role_id: "role_employee",
      store_ids: ["outlet_1"],
    });
    expect(linkCase.state.users[0]?.employee_id).toBe("emp_1");
    expect(linkCase.state.userRoles).toEqual([{ user_id: "user_unlinked", role_id: "role_employee" }]);
  });

  it("login link candidates are safe, searchable beyond the first page, and exclude users linked to other employees", async () => {
    const users = Array.from({ length: 130 }, (_, index) => ({
      id: `user_${index + 1}`,
      company_id: "company_1",
      employee_id: index === 5 ? "emp_other" : null,
      username: `candidate${index + 1}`,
      full_name: index === 124 ? "Zara Beyond First Page" : `Candidate ${String(index + 1).padStart(3, "0")}`,
      email: index === 124 ? "zara.beyond@example.com" : `candidate${index + 1}@example.com`,
      password_hash: "hash",
      password_algo: "pbkdf2_sha256",
      password_reset_required: 0,
      two_factor_enabled: 0,
      status: "active",
      last_login_at: null,
      deleted_at: null,
      created_at: "",
      updated_at: "",
    }));
    const { env } = makeEmployeeLoginEnv({ users });

    const result = await employeesService.listEmployeeLoginLinkCandidates(
      env,
      { ...employeeLoginActor([]), roleKeys: ["super_admin"], roles: ["Super Admin"] },
      { employee_id: "emp_1", search: "zara", page: 1, page_size: 20 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "user_125",
      full_name: "Zara Beyond First Page",
      linked_status: "available",
    });
    expect(JSON.stringify(result.rows[0])).not.toContain("password_hash");
    expect(result.rows.some((user) => user.employee_id === "emp_other")).toBe(false);
  });
});


