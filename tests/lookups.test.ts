import { describe, expect, it } from "vitest";

import app from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/modules/auth/auth.constants";
import { hashToken } from "../src/utils/crypto";

const env = { ENVIRONMENT: "local" } as Env;
const SESSION_TOKEN = "lookup-session-token";
const SESSION_SECRET = "lookup-session-secret";

const employees = [
  {
    id: "emp_1",
    company_id: "company_1",
    employee_code: "EMP001",
    full_name: "Aisha Hassan",
    employment_status: "active",
    primary_outlet_id: "outlet_1",
    department_id: "dept_1",
    position_id: "pos_1",
    salary_amount: 900000,
    bank_account_number: "secret-bank-account",
    passport_number: "P123456",
    id_card_number: "A123456",
    password_hash: "must-not-leak",
  },
  {
    id: "emp_2",
    company_id: "company_1",
    employee_code: "EMP002",
    full_name: "Ibrahim Shareef",
    employment_status: "active",
    primary_outlet_id: "outlet_2",
    department_id: "dept_1",
    position_id: "pos_1",
    salary_amount: 800000,
    bank_account_number: "other-secret-bank-account",
    passport_number: "P654321",
    id_card_number: "B654321",
    password_hash: "must-not-leak-either",
  },
];

const outlets = [
  { id: "outlet_1", company_id: "company_1", code: "OUT-1", name: "Male Outlet", status: "active", deleted_at: null },
  { id: "outlet_2", company_id: "company_1", code: "OUT-2", name: "Addu Outlet", status: "active", deleted_at: null },
];

const leaveTypes = [
  { id: "lt_annual", company_id: "company_1", leave_key: "annual", leave_name: "Annual Leave", is_enabled: 1 },
  { id: "lt_sick", company_id: "company_1", leave_key: "sick", leave_name: "Sick Leave", is_enabled: 1 },
];

const payrollRuns = [
  { id: "run_1", company_id: "company_1", payroll_month: "2026-06", status: "finalized" },
  { id: "run_2", company_id: "company_1", payroll_month: "2026-05", status: "draft" },
];

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();

const filterEmployeeLookupRows = (sql: string, values: unknown[]) => {
  const normalized = normalizeSql(sql);
  let rows = employees.filter((employee) => employee.company_id === "company_1");

  if (normalized.includes("primary_outlet_id in")) {
    rows = rows.filter((employee) => employee.primary_outlet_id === "outlet_1");
  }

  if (normalized.includes("primary_outlet_id = ?")) {
    const outletValues = values.filter((value) => String(value).startsWith("outlet_"));
    const requestedOutlet = outletValues.length > 1 ? String(outletValues[outletValues.length - 1]) : undefined;
    if (requestedOutlet) rows = rows.filter((employee) => employee.primary_outlet_id === requestedOutlet);
  }

  if (normalized.includes(" id = ?")) {
    const requestedEmployee = values.find((value) => String(value).startsWith("emp_"));
    if (requestedEmployee) rows = rows.filter((employee) => employee.id === requestedEmployee);
  }

  if (normalized.includes("department_id = ?")) {
    const requestedDepartment = values.find((value) => String(value).startsWith("dept_"));
    if (requestedDepartment) rows = rows.filter((employee) => employee.department_id === requestedDepartment);
  }

  if (normalized.includes("position_id = ?")) {
    const requestedPosition = values.find((value) => String(value).startsWith("pos_"));
    if (requestedPosition) rows = rows.filter((employee) => employee.position_id === requestedPosition);
  }

  if (normalized.includes("employment_status = ?")) {
    rows = rows.filter((employee) => employee.employment_status === "active");
  }

  const search = values.find((value) => typeof value === "string" && value.startsWith("%") && value.endsWith("%"));
  if (search) {
    const term = String(search).replaceAll("%", "").toLowerCase();
    rows = rows.filter((employee) =>
      [employee.employee_code, employee.full_name, employee.passport_number, employee.id_card_number]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }

  return rows.map((employee) => ({
    id: employee.id,
    employee_code: employee.employee_code,
    full_name: employee.full_name,
    employment_status: employee.employment_status,
  }));
};

type LookupEnvOptions = {
  permissions?: string[];
  roleKey?: string;
  roleName?: string;
  outletIds?: string[];
  employeeId?: string | null;
};

const createLookupEnv = async (options: LookupEnvOptions = {}) => {
  const tokenHash = await hashToken(SESSION_TOKEN, SESSION_SECRET);
  const permissions = options.permissions ?? ["employees.view", "outlets.view", "departments.view", "positions.view", "leave.view", "payroll.view"];
  const outletIds = options.outletIds ?? ["outlet_1"];
  const roleKey = options.roleKey ?? "outlet_manager";
  const roleName = options.roleName ?? "Outlet Manager";
  const employeeId = options.employeeId ?? "emp_1";

  return {
    ENVIRONMENT: "local",
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
                    user_id: "user_1",
                    session_token_hash: tokenHash,
                    revoked_at: null,
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                  };
                }
                if (normalized.includes("from users")) {
                  return {
                    id: "user_1",
                    company_id: "company_1",
                    employee_id: employeeId,
                    email: "manager@example.com",
                    full_name: "Outlet Manager",
                    status: "active",
                    deleted_at: null,
                  };
                }
                if (normalized.includes("count(*) as total from employees")) {
                  return { total: filterEmployeeLookupRows(sql, values).length };
                }
                if (normalized.includes("count(*) as total from outlets")) {
                  return { total: outlets.filter((outlet) => outlet.id === "outlet_1").length };
                }
                if (normalized.includes("count(*) as total from leave_types")) {
                  return { total: leaveTypes.length };
                }
                if (normalized.includes("count(*) as total from payroll_runs")) {
                  return { total: permissions.some((permission) => permission.startsWith("payroll")) ? payrollRuns.length : 0 };
                }
                return null;
              },
              async all() {
                if (normalized.includes("from user_roles")) {
                  return { results: [{ id: "role_1", role_key: roleKey, role_name: roleName }] };
                }
                if (normalized.includes("from role_permissions")) {
                  return { results: permissions.map((permission_key) => ({ permission_key })) };
                }
                if (normalized.includes("from user_permission_overrides")) {
                  return { results: [] };
                }
                if (normalized.includes("from user_outlets")) {
                  return { results: outletIds.map((outlet_id) => ({ outlet_id })) };
                }
                if (normalized.includes("from employees")) {
                  return { results: filterEmployeeLookupRows(sql, values) };
                }
                if (normalized.includes("from outlets")) {
                  const scoped = normalized.includes("id in") ? outlets.filter((outlet) => outletIds.includes(outlet.id)) : outlets;
                  return { results: scoped.map(({ id, code, name, status }) => ({ id, code, name, status })) };
                }
                if (normalized.includes("from leave_types")) {
                  return {
                    results: leaveTypes.map((row) => ({
                      id: row.id,
                      code: row.leave_key,
                      name: row.leave_name,
                      status: row.is_enabled === 1 ? "active" : "disabled",
                    })),
                  };
                }
                if (normalized.includes("from payroll_runs")) {
                  return { results: payrollRuns.map(({ id, payroll_month, status }) => ({ id, payroll_month, status })) };
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
    },
  } as unknown as Env;
};

const authenticatedRequest = async (path: string, options?: LookupEnvOptions) =>
  app.request(path, { headers: { cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}` } }, await createLookupEnv(options));

describe("lookup routes", () => {
  const routes = [
    "/api/v1/lookups/employees",
    "/api/v1/lookups/outlets",
    "/api/v1/lookups/departments",
    "/api/v1/lookups/positions",
    "/api/v1/lookups/leave-types",
    "/api/v1/lookups/payroll-periods",
  ];

  it.each(routes)("%s is registered and requires authentication", async (route) => {
    const response = await app.request(route, {}, env);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).not.toBe("API_ROUTE_NOT_FOUND");
  });

  it("employee lookup returns compact safe labels without salary, bank, document, or auth fields", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/employees?search=EMP001&page=1&page_size=10");
    const body = await response.json() as { data: Array<Record<string, unknown>>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.pagination.total).toBe(1);
    expect(body.data).toEqual([
      {
        id: "emp_1",
        code: "EMP001",
        name: "Aisha Hassan",
        label: "EMP001 - Aisha Hassan",
        status: "active",
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/salary|bank|document|password|secret|passport|id_card/i);
  });

  it("outlet-scoped manager only sees allowed outlet employees", async () => {
    const allowedResponse = await authenticatedRequest("/api/v1/lookups/employees?outlet_id=outlet_1&page=1&page_size=10");
    const blockedResponse = await authenticatedRequest("/api/v1/lookups/employees?outlet_id=outlet_2&page=1&page_size=10");
    const allowed = await allowedResponse.json() as { data: Array<{ id: string }>; pagination: { total: number } };
    const blocked = await blockedResponse.json() as { data: Array<{ id: string }>; pagination: { total: number } };

    expect(allowedResponse.status).toBe(200);
    expect(allowed.data.map((row) => row.id)).toEqual(["emp_1"]);
    expect(allowed.pagination.total).toBe(1);
    expect(blockedResponse.status).toBe(200);
    expect(blocked.data).toEqual([]);
    expect(blocked.pagination.total).toBe(0);
  });

  it("normal employee cannot list company employees through /lookups/employees", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/employees?page=1&page_size=10", {
      permissions: ["my_profile.view", "leave.requests.submit"],
      roleKey: "employee",
      roleName: "Employee",
      outletIds: [],
      employeeId: "emp_1",
    });
    const body = await response.json() as { data: Array<{ id: string }>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["emp_1"]);
    expect(body.pagination.total).toBe(1);
  });

  it("employee lookup works for HR/Admin with employees.view", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/employees?page=1&page_size=10", {
      permissions: ["employees.view"],
      roleKey: "hr_admin",
      roleName: "HR Admin",
      outletIds: [],
    });
    const body = await response.json() as { data: Array<{ id: string }>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["emp_1", "emp_2"]);
    expect(body.pagination.total).toBe(2);
  });

  it("employee lookup applies department, position, search, and pagination safely", async () => {
    const response = await authenticatedRequest(
      "/api/v1/lookups/employees?department_id=dept_1&position_id=pos_1&search=Aisha&page=1&page_size=1",
    );
    const body = await response.json() as { data: Array<{ id: string; label: string }>; pagination: { page: number; page_size: number; total: number } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: "emp_1", code: "EMP001", name: "Aisha Hassan", label: "EMP001 - Aisha Hassan", status: "active" }]);
    expect(body.pagination).toMatchObject({ page: 1, page_size: 1, total: 1 });
  });

  it("leave type lookup works for leave request users", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/leave-types?page=1&page_size=10", {
      permissions: ["leave.requests.submit"],
      roleKey: "employee",
      roleName: "Employee",
      outletIds: [],
    });
    const body = await response.json() as { data: Array<{ code: string; label: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.code)).toEqual(["annual", "sick"]);
  });

  it("outlet lookup respects outlet scope", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/outlets?page=1&page_size=10", {
      permissions: ["outlets.view"],
      outletIds: ["outlet_1"],
    });
    const body = await response.json() as { data: Array<{ id: string }>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["outlet_1"]);
    expect(body.pagination.total).toBe(1);
  });

  it("normal employee cannot list payroll periods through /lookups/payroll-periods", async () => {
    const response = await authenticatedRequest("/api/v1/lookups/payroll-periods?page=1&page_size=10", {
      permissions: ["my_profile.view", "payslips.view"],
      roleKey: "employee",
      roleName: "Employee",
      outletIds: [],
    });
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("LOOKUP_PERMISSION_DENIED");
  });

  it("payroll-period lookup requires payroll/report permission", async () => {
    const denied = await authenticatedRequest("/api/v1/lookups/payroll-periods?page=1&page_size=10", {
      permissions: ["employees.view"],
    });
    const allowed = await authenticatedRequest("/api/v1/lookups/payroll-periods?page=1&page_size=10", {
      permissions: ["payroll_reports.view"],
      outletIds: [],
    });
    const body = await allowed.json() as { data: Array<{ payroll_month: string }> };

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(body.data.map((row) => row.payroll_month)).toEqual(["2026-06", "2026-05"]);
  });
});
