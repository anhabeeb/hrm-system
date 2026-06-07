import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/modules/auth/auth.constants";
import { hashToken } from "../src/utils/crypto";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const SESSION_TOKEN = "job-change-session-token";
const SESSION_SECRET = "job-change-session-secret";
const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();

const employeeRow = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP-000001",
  full_name: "Aisha Hassan",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  primary_outlet_name: "Front Outlet",
  department_id: "dept_wait",
  department_name: "Service",
  position_id: "pos_waiter",
  position_title: "Waiter",
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
  created_at: "2026-01-01T00:00:00.000Z",
};

const createJobChangeEnv = async (options: {
  superAdmin?: boolean;
  permissions?: string[];
  lockedPayroll?: boolean;
  invalidDepartment?: boolean;
  invalidPosition?: boolean;
  invalidOutlet?: boolean;
  futureSalary?: boolean;
  auditThrows?: boolean;
} = {}) => {
  const tokenHash = await hashToken(SESSION_TOKEN, SESSION_SECRET);
  const batchSql: string[] = [];

  const env = {
    ENVIRONMENT: "test",
    SESSION_SECRET,
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const normalized = normalizeSql(sql);
            return {
              sql,
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
                    feature_key: "employee_management",
                    is_enabled: 1,
                    status: "active",
                    allowed_role_ids_json: null,
                    allowed_outlet_ids_json: null,
                    applies_to_all_outlets: 1,
                  };
                }
                if (normalized.includes("from employees e")) {
                  return employeeRow;
                }
                if (normalized.includes("from outlets")) {
                  if (options.invalidOutlet) return null;
                  return { id: String(values[1] ?? "outlet_2"), name: "Back Outlet", status: "active" };
                }
                if (normalized.includes("from departments")) {
                  if (options.invalidDepartment) return null;
                  return { id: String(values[1] ?? "dept_service"), name: "Service", status: "active" };
                }
                if (normalized.includes("from positions")) {
                  if (options.invalidPosition) return null;
                  return { id: String(values[1] ?? "pos_senior"), department_id: "dept_service", title: "Senior Waiter", status: "active" };
                }
                if (normalized.includes("from payroll_runs")) {
                  return options.lockedPayroll ? { id: "pay_2026_08", status: "locked" } : null;
                }
                if (normalized.includes("count(*) as total from employee_salary_history")) return { total: 1 };
                if (normalized.includes("select id, effective_from from employee_salary_history")) {
                  return options.futureSalary ? { id: "salary_future", effective_from: "2026-08-01" } : null;
                }
                if (normalized.includes("from employee_salary_history") && normalized.includes("effective_from <=")) return currentSalary;
                if (normalized.includes("from employee_salary_history") && normalized.includes("and id = ?")) {
                  return {
                    ...currentSalary,
                    id: String(values[2] ?? "salary_hist_new"),
                    monthly_salary_amount: 900000,
                    effective_from: "2026-08-01",
                    change_type: "promotion",
                    reason: "Promotion salary adjustment",
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
                        : { id: "role_hr", role_key: "hr_admin", role_name: "HR Admin" },
                    ],
                  };
                }
                if (normalized.includes("from role_permissions")) {
                  return { results: (options.permissions ?? []).map((permission_key) => ({ permission_key })) };
                }
                if (normalized.includes("from user_permission_overrides")) return { results: [] };
                if (normalized.includes("from user_outlets")) return { results: [{ outlet_id: "outlet_1" }, { outlet_id: "outlet_2" }] };
                if (normalized.includes("from employee_job_history h")) {
                  return {
                    results: [{
                      id: "job_hist_1",
                      change_type: "promotion",
                      effective_from: "2026-08-01",
                      old_position_title: "Waiter",
                      new_position_title: "Senior Waiter",
                      old_department_name: "Service",
                      new_department_name: "Service",
                      old_outlet_name: "Front Outlet",
                      new_outlet_name: "Back Outlet",
                      created_by_name: "Admin User",
                    }],
                  };
                }
                return { results: [] };
              },
              async run() {
                if (options.auditThrows && normalized.includes("insert into audit_logs")) {
                  throw new Error("audit unavailable");
                }
                return { success: true };
              },
            };
          },
        };
      },
      async batch(statements: Array<{ sql?: string }>) {
        batchSql.push(...statements.map((statement) => String(statement.sql ?? "")));
        return [];
      },
    },
    __batchSql: batchSql,
  } as unknown as Env & { __batchSql: string[] };

  return env;
};

const jobChangeRequest = async (env: Env, body: Record<string, unknown>) =>
  app.request(
    "/api/v1/employees/emp_1/job-change",
    {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );

const validJobChange = {
  change_type: "promotion",
  effective_from: "2026-08-01",
  new_department_id: "dept_service",
  new_position_id: "pos_senior",
  new_outlet_id: "outlet_2",
  reason: "Promoted after performance review",
};

describe("job change workflow", () => {
  it("registers job-change routes with job history permissions", () => {
    const routes = read("src/routes/employees.routes.ts");

    expect(routes).toContain("/:id/job-change");
    expect(routes).toContain("employees.job_change.manage");
    expect(routes).toContain("JOB_CHANGE_PERMISSION_DENIED");
    expect(routes).toContain("/:id/job-history");
    expect(routes).toContain("employees.job_history.view");
  });

  it("stores old and new job values in job history schema", () => {
    const migration = read("migrations/0019_job_history_old_new_columns.sql");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(migration).toContain("old_outlet_id");
    expect(migration).toContain("new_position_id");
    expect(repository).toContain("createJobChangeWithOptionalSalary");
    expect(repository).toContain("old_position_title");
    expect(repository).toContain("new_position_title");
  });

  it("connects the employee profile Employment / Job History UI to job-change endpoints and selectors", () => {
    const panel = read("frontend/src/features/employees/EmployeeJobHistoryPanel.tsx");
    const api = read("frontend/src/features/employees/employees.api.ts");
    const drawer = read("frontend/src/features/employees/EmployeeDetailDrawer.tsx");

    expect(drawer).toContain("Employment / Job History");
    expect(api).toContain("/job-history");
    expect(api).toContain("/job-change");
    expect(panel).toContain("OutletCombobox");
    expect(panel).toContain("DepartmentCombobox");
    expect(panel).toContain("PositionCombobox");
    expect(panel).toContain("Update salary with this job change");
    expect(panel).toContain("majorToMinor");
  });

  it("authorized user can create a promotion job change", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.edit"] });
    const response = await jobChangeRequest(env, validJobChange);
    const body = await response.json() as { data?: { job_change?: { change_type?: string; new_position_id?: string } } };

    expect(response.status).toBe(200);
    expect(body.data?.job_change?.change_type).toBe("promotion");
    expect(body.data?.job_change?.new_position_id).toBe("pos_senior");
    expect(env.__batchSql.join("\n")).toContain("INSERT INTO employee_job_history");
  });

  it("Super Admin can create promotion even if specific permission seed is missing", async () => {
    const response = await jobChangeRequest(await createJobChangeEnv({ superAdmin: true }), validJobChange);

    expect(response.status).toBe(200);
  });

  it("unauthorized user cannot create job change", async () => {
    const response = await jobChangeRequest(await createJobChangeEnv(), validJobChange);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("JOB_CHANGE_PERMISSION_DENIED");
  });

  it("missing reason and effective date return job-change validation codes", async () => {
    const response = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"] }), {
      change_type: "promotion",
      new_position_id: "pos_senior",
    });
    const body = await response.json() as { error?: { code?: string; fieldErrors?: Record<string, string> } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("JOB_CHANGE_EFFECTIVE_DATE_REQUIRED");
    expect(body.error?.fieldErrors?.reason).toBe("Reason is required.");
  });

  it("no changed fields returns JOB_CHANGE_NO_FIELDS_CHANGED", async () => {
    const response = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"] }), {
      change_type: "promotion",
      effective_from: "2026-08-01",
      new_department_id: "dept_wait",
      new_position_id: "pos_waiter",
      new_outlet_id: "outlet_1",
      reason: "Promoted after performance review",
    });
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("JOB_CHANGE_NO_FIELDS_CHANGED");
  });

  it("invalid department, position, and outlet use structured errors", async () => {
    const invalidDepartment = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"], invalidDepartment: true }), validJobChange);
    const invalidPosition = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"], invalidPosition: true }), validJobChange);
    const invalidOutlet = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"], invalidOutlet: true }), validJobChange);

    expect((await invalidDepartment.json() as { error?: { code?: string } }).error?.code).toBe("INVALID_DEPARTMENT");
    expect((await invalidPosition.json() as { error?: { code?: string } }).error?.code).toBe("INVALID_POSITION");
    expect((await invalidOutlet.json() as { error?: { code?: string } }).error?.code).toBe("INVALID_OUTLET");
  });

  it("promotion with salary_change creates salary history in the same batch", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.edit", "employees.salary.manage"] });
    const response = await jobChangeRequest(env, {
      ...validJobChange,
      salary_change: {
        enabled: true,
        monthly_salary_amount: 900000,
        currency: "MVR",
        change_type: "promotion",
        reason: "Promotion salary adjustment",
      },
    });
    const body = await response.json() as { data?: { salary_change?: { monthly_salary_amount?: number; change_type?: string } } };
    const batch = env.__batchSql.join("\n");

    expect(response.status).toBe(200);
    expect(body.data?.salary_change?.monthly_salary_amount).toBe(900000);
    expect(body.data?.salary_change?.change_type).toBe("promotion");
    expect(batch).toContain("UPDATE employee_salary_history");
    expect(batch).toContain("INSERT INTO employee_salary_history");
  });

  it("promotion without salary_change does not create salary history", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.edit"] });
    const response = await jobChangeRequest(env, validJobChange);

    expect(response.status).toBe(200);
    expect(env.__batchSql.join("\n")).not.toContain("INSERT INTO employee_salary_history");
  });

  it("salary overlap returns SALARY_OVERLAP and does not update job fields", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.edit", "employees.salary.manage"], futureSalary: true });
    const response = await jobChangeRequest(env, {
      ...validJobChange,
      salary_change: { enabled: true, monthly_salary_amount: 900000, reason: "Promotion salary adjustment" },
    });
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("SALARY_OVERLAP");
    expect(env.__batchSql).toHaveLength(0);
  });

  it("finalized payroll salary change is rejected before job mutation", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.edit", "employees.salary.manage"], lockedPayroll: true });
    const response = await jobChangeRequest(env, {
      ...validJobChange,
      salary_change: { enabled: true, monthly_salary_amount: 900000, reason: "Promotion salary adjustment" },
    });
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(423);
    expect(body.error?.code).toBe("SALARY_CHANGE_FINALIZED_PERIOD_LOCKED");
    expect(env.__batchSql).toHaveLength(0);
  });

  it("audit log failure does not fail the job change", async () => {
    const response = await jobChangeRequest(await createJobChangeEnv({ permissions: ["employees.edit"], auditThrows: true }), validJobChange);

    expect(response.status).toBe(200);
  });

  it("job history endpoint returns readable labels where practical", async () => {
    const env = await createJobChangeEnv({ permissions: ["employees.view"] });
    const response = await app.request(
      "/api/v1/employees/emp_1/job-history",
      { headers: { cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}` } },
      env,
    );
    const body = await response.json() as { data?: { history?: Array<{ old_position_title?: string; new_position_title?: string }> } };

    expect(response.status).toBe(200);
    expect(body.data?.history?.[0]?.old_position_title).toBe("Waiter");
    expect(body.data?.history?.[0]?.new_position_title).toBe("Senior Waiter");
  });
});
