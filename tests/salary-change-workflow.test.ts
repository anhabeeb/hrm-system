import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/modules/auth/auth.constants";
import { dayBefore } from "../src/modules/employees/employees.service";
import { hashToken } from "../src/utils/crypto";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const SESSION_TOKEN = "salary-session-token";
const SESSION_SECRET = "salary-session-secret";
const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();

const employeeRow = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP-000001",
  full_name: "Aisha Hassan",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  employment_status: "active",
  deleted_at: null,
  joined_at: "2026-01-01",
};

const currentSalary = {
  id: "salary_hist_old",
  company_id: "company_1",
  employee_id: "emp_1",
  monthly_salary_amount: 750000,
  currency: "MVR",
  effective_from: "2026-01-01",
  effective_to: null,
  reason: "Starting salary",
  change_type: "starting_salary",
  created_by: "user_admin",
  created_by_name: "Admin User",
  created_at: "2026-01-01T00:00:00.000Z",
};

const createSalaryRouteEnv = async (options: { superAdmin?: boolean; lockedPayroll?: boolean } = {}) => {
  const tokenHash = await hashToken(SESSION_TOKEN, SESSION_SECRET);

  return {
    ENVIRONMENT: "test",
    SESSION_SECRET,
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const normalized = normalizeSql(sql);
            return {
              async first() {
                if (normalized.includes("from sessions")) {
                  return {
                    id: "session_1",
                    company_id: "company_1",
                    user_id: "user_admin",
                    session_token_hash: tokenHash,
                    revoked_at: null,
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                  };
                }
                if (normalized.includes("from users") && normalized.includes("where")) {
                  return {
                    id: "user_admin",
                    company_id: "company_1",
                    email: "admin@example.com",
                    full_name: "Admin User",
                    status: "active",
                    deleted_at: null,
                  };
                }
                if (normalized.includes("from feature_settings")) {
                  return {
                    id: "feature_employees",
                    company_id: "company_1",
                    feature_key: "employees",
                    is_enabled: 1,
                    status: "active",
                    allowed_role_ids_json: null,
                    allowed_outlet_ids_json: null,
                    applies_to_all_outlets: 1,
                  };
                }
                if (normalized.includes("from employees e")) return employeeRow;
                if (normalized.includes("from payroll_runs")) {
                  return options.lockedPayroll ? { id: "pay_2026_07", status: "locked" } : null;
                }
                if (normalized.includes("count(*) as total from employee_salary_history")) return { total: 1 };
                if (normalized.includes("select id, effective_from from employee_salary_history")) return null;
                if (normalized.includes("from employee_salary_history") && normalized.includes("effective_from <=")) return currentSalary;
                if (normalized.includes("from employee_salary_history") && normalized.includes("and id = ?")) {
                  return {
                    ...currentSalary,
                    id: String(values[2] ?? "salary_hist_new"),
                    monthly_salary_amount: 850000,
                    effective_from: "2026-07-01",
                    effective_to: null,
                    reason: "Annual salary increment after performance review",
                    change_type: "increment",
                  };
                }
                return null;
              },
              async all() {
                if (normalized.includes("from user_roles")) {
                  return {
                    results: [
                      options.superAdmin
                        ? { id: "role_super", role_key: "super_admin", role_name: "Super Admin" }
                        : { id: "role_staff", role_key: "employee", role_name: "Employee" },
                    ],
                  };
                }
                if (normalized.includes("from role_permissions") || normalized.includes("from user_permission_overrides")) {
                  return { results: [] };
                }
                if (normalized.includes("from user_outlets")) {
                  return { results: [{ outlet_id: "outlet_1" }] };
                }
                if (normalized.includes("from employee_salary_history h")) {
                  return { results: [currentSalary] };
                }
                return { results: [] };
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
      async batch() {
        return [];
      },
    },
  } as unknown as Env;
};

const salaryRequest = async (
  path: string,
  init: RequestInit,
  env: Env,
) =>
  app.request(
    path,
    {
      ...init,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    env,
  );

describe("salary change workflow wiring", () => {
  it("registers salary history routes with salary and payroll permission aliases", () => {
    const routes = read("src/routes/employees.routes.ts");

    expect(routes).toContain("/:id/salary-history");
    expect(routes).toContain("employees.salary.view");
    expect(routes).toContain("employees.view_salary");
    expect(routes).toContain("payroll.view");
    expect(routes).toContain("employees.salary.manage");
    expect(routes).toContain("employees.edit_salary");
    expect(routes).toContain("payroll.manage");
  });

  it("closes the previous active salary before creating a new salary history row", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("findActiveSalaryAtOrBefore");
    expect(service).toContain("findFutureSalary");
    expect(service).toContain("SALARY_OVERLAP");
    expect(service).toContain("createSalaryTimelineChange");
    expect(service).toContain("dayBefore(input.effective_from)");
    expect(service).toContain("employee_salary_changed");
  });

  it("stores salary change metadata in employee_salary_history", () => {
    const repository = read("src/modules/employees/employees.repository.ts");
    const migration = read("migrations/0018_salary_history_change_type.sql");

    expect(migration).toContain("ADD COLUMN change_type");
    expect(repository).toContain("change_type");
    expect(repository).toContain("effective_to = ?");
    expect(repository).toContain("LEFT JOIN users");
    expect(repository).not.toContain("position_default_salary");
  });

  it("connects the Employee Profile Salary & Compensation UI to the salary-history endpoint", () => {
    const panel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");
    const api = read("frontend/src/features/employees/employees.api.ts");
    const page = read("frontend/src/features/employees/EmployeesPage.tsx");

    expect(api).toContain("addSalaryHistory");
    expect(api).toContain("/salary-history");
    expect(panel).toContain("Add Salary Change");
    expect(panel).toContain("majorToMinor");
    expect(panel).toContain("No salary record exists for this employee.");
    expect(page).toContain("employees.salary.manage");
    expect(page).toContain("employees.salary.view");
  });

  it("calculates previous salary effective_to using UTC date-only logic", () => {
    expect(dayBefore("2026-07-01")).toBe("2026-06-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });

  it("returns SALARY_PERMISSION_DENIED when a user without salary permission views salary history", async () => {
    const response = await salaryRequest(
      "/api/v1/employees/emp_1/salary-history",
      { method: "GET" },
      await createSalaryRouteEnv(),
    );
    const body = await response.json() as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("SALARY_PERMISSION_DENIED");
    expect(body.error?.message).toContain("permission");
  });

  it("returns SALARY_PERMISSION_DENIED when a user without salary edit permission creates a salary change", async () => {
    const response = await salaryRequest(
      "/api/v1/employees/emp_1/salary-history",
      {
        method: "POST",
        body: JSON.stringify({
          monthly_salary_amount: 850000,
          effective_from: "2026-07-01",
          change_type: "increment",
          reason: "Annual salary increment after performance review",
        }),
      },
      await createSalaryRouteEnv(),
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("SALARY_PERMISSION_DENIED");
  });

  it("allows Super Admin salary changes even when seeded salary permissions are missing", async () => {
    const response = await salaryRequest(
      "/api/v1/employees/emp_1/salary-history",
      {
        method: "POST",
        body: JSON.stringify({
          monthly_salary_amount: 850000,
          currency: "MVR",
          effective_from: "2026-07-01",
          change_type: "increment",
          reason: "Annual salary increment after performance review",
        }),
      },
      await createSalaryRouteEnv({ superAdmin: true }),
    );
    const body = await response.json() as { data?: { closed_previous_salary_id?: string | null; salary?: { monthly_salary_amount?: number } } };

    expect(response.status).toBe(201);
    expect(body.data?.closed_previous_salary_id).toBe("salary_hist_old");
    expect(body.data?.salary?.monthly_salary_amount).toBe(850000);
  });

  it("rejects salary changes that affect locked payroll periods", async () => {
    const response = await salaryRequest(
      "/api/v1/employees/emp_1/salary-history",
      {
        method: "POST",
        body: JSON.stringify({
          monthly_salary_amount: 850000,
          currency: "MVR",
          effective_from: "2026-07-01",
          change_type: "increment",
          reason: "Annual salary increment after performance review",
        }),
      },
      await createSalaryRouteEnv({ superAdmin: true, lockedPayroll: true }),
    );
    const body = await response.json() as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string> } };

    expect(response.status).toBe(423);
    expect(body.error?.code).toBe("SALARY_CHANGE_FINALIZED_PERIOD_LOCKED");
    expect(body.error?.message).toBe("Salary changes cannot affect a finalized payroll period.");
    expect(body.error?.fieldErrors?.effective_from).toContain("finalized payroll");
  });
});
