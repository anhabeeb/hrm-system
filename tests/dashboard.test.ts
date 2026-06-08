import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { getQuickActions, getSummary } from "../src/modules/dashboard/dashboard.service";
import { approvalInboxCount } from "../src/modules/dashboard/dashboard.repository";
import { getEmployeeProfileAlerts } from "../src/modules/employees/employees.service";
import type { AuthActor } from "../src/types/api.types";

const readSource = async (path: string) => readFileSync(path, "utf8");

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "Admin User",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: [
    "dashboard.view",
    "dashboard.view_company",
    "dashboard.attendance.view",
    "dashboard.leave.view",
    "dashboard.long_leave.view",
    "dashboard.expiry_alerts.view",
    "dashboard.device_health.view",
    "dashboard.payroll_readiness.view",
    "dashboard.admin_health.view",
    "employees.view",
    "email_notifications.admin.view",
    "notifications.view",
    "leave.approvals.view",
    "attendance.reports.view",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const rowForSql = (sql: string) => {
  if (sql.includes("FROM employees e") && sql.includes("total_active")) return { total_active: 12, local_employees: 7, foreign_employees: 5, probation: 2, on_leave: 1, on_long_leave: 1 };
  if (sql.includes("FROM attendance_daily_summary s") && sql.includes("present_today")) return { present_today: 8, absent_today: 1, late_checkins: 2, missing_checkin: 1, missing_checkout: 1, overtime_today: 1, holiday_work_today: 0 };
  if (sql.includes("FROM attendance_conflicts")) return { total: 3 };
  if (sql.includes("FROM leave_requests l") && sql.includes("pending_leave_approvals")) return { pending_leave_approvals: 4, submitted_today: 1, submitted_this_week: 2, rejected_cancelled: 1 };
  if (sql.includes("FROM leave_approval_steps")) return { total: 2 };
  if (sql.includes("FROM leave_balances lb")) return { low_leave_balance_warnings: 1, negative_balance_warnings: 1 };
  if (sql.includes("FROM long_leave_records ll")) return { active: 1, pending_approval: 1, returns_this_week: 1, returns_this_month: 2, overdue_returns: 0, payroll_review_required: 1 };
  if (sql.includes("FROM long_leave_payroll_impacts i")) return { total: 2 };
  if (sql.includes("FROM expiry_alerts a")) return { critical: 2, due_today: 1, due_within_7_days: 3, due_within_30_days: 5, overdue: 1, passport: 1, work_permit: 1, contract: 1, probation: 1, document: 2 };
  if (sql.includes("FROM notifications")) return { unread: 6, urgent: 1 };
  if (sql.includes("FROM email_notifications")) return { pending_email_jobs: 2, failed_email_jobs: 1 };
  if (sql.includes("FROM biometric_devices")) return { active_devices: 3, offline_devices: 1, suspended_revoked_devices: 1 };
  if (sql.includes("FROM biometric_attendance_logs")) return { unmatched_punches: 2, ambiguous_punches: 1, invalid_timestamp_punches: 1 };
  if (sql.includes("FROM roster_conflicts")) return { holiday_roster_warnings: 1, open_roster_conflicts: 2 };
  if (sql.includes("FROM payroll_runs")) return { unfinalized: 1 };
  if (sql.includes("approved_leave_not_finalized")) return { approved_leave_not_finalized: 1 };
  return {};
};

const rowsForSql = (sql: string) => {
  if (sql.includes("GROUP BY e.primary_outlet_id")) return [{ outlet_id: "outlet_1", outlet_name: "Main", total: 12 }];
  if (sql.includes("GROUP BY e.department_id")) return [{ department_id: "dept_1", department_name: "Ops", total: 8 }];
  if (sql.includes("FROM holidays h")) return [{ id: "holiday_1", name: "Company Day", date: new Date().toISOString().slice(0, 10), holiday_type: "company_holiday" }];
  return [];
};

const fakeEnv = () => ({
  DB: {
    prepare: (sql: string) => ({
      bind: (..._values: unknown[]) => ({
        first: async () => rowForSql(sql),
        all: async () => ({ results: rowsForSql(sql) }),
      }),
    }),
  },
}) as unknown as Env;

type CapturedCall = { sql: string; values: unknown[]; method: "first" | "all" };

const captureEnv = (handlers: {
  first?: (sql: string, values: unknown[]) => Record<string, unknown> | null;
  all?: (sql: string, values: unknown[]) => Array<Record<string, unknown>>;
} = {}) => {
  const calls: CapturedCall[] = [];
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            calls.push({ sql, values, method: "first" });
            return handlers.first?.(sql, values) ?? rowForSql(sql);
          },
          all: async () => {
            calls.push({ sql, values, method: "all" });
            return { results: handlers.all?.(sql, values) ?? rowsForSql(sql) };
          },
        }),
      }),
    },
  } as unknown as Env;

  return { env, calls };
};

const employeeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "emp_1",
  employee_code: "EMP-001",
  full_name: "Employee One",
  employee_type: "foreign",
  employment_status: "active",
  primary_outlet_id: "outlet_1",
  department_id: "dept_1",
  joined_at: "2025-01-01",
  ...overrides,
});

describe("Phase 11A dashboard completion", () => {
  it("summary endpoint works", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.employee_summary?.total_active_employees).toBe(12);
    expect(result.meta.scope).toBe("company");
  });

  it("attendance today widget uses attendance summary data", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.attendance_today).toMatchObject({
      present_today: 8,
      missing_checkin_count: 1,
      attendance_exceptions_open: 3,
    });
  });

  it("leave approvals widget counts pending approvals", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.leave_approvals?.pending_leave_approvals).toBe(4);
    expect(result.data.leave_approvals?.approval_inbox_count).toBe(2);
  });

  it("long leave widget counts active pending and returns due", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.long_leave?.employees_currently_on_long_leave).toBe(1);
    expect(result.data.long_leave?.expected_returns_this_month).toBe(2);
  });

  it("expiry widget uses expiry alert summary", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.expiry_alerts?.critical_alerts).toBe(2);
    expect(result.data.expiry_alerts?.due_within_30_days).toBe(5);
  });

  it("notification widget uses unread count", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.notifications_email_health?.unread_in_app_notifications).toBe(6);
  });

  it("email health widget is admin-only", async () => {
    const result = await getSummary(fakeEnv(), actor({ permissions: ["dashboard.view", "notifications.view"], isAdmin: false }));
    expect(result.data.notifications_email_health?.pending_email_jobs).toBeNull();
  });

  it("device health widget counts offline and biometric review rows", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.device_health?.offline_devices).toBe(1);
    expect(result.data.device_health?.unmatched_biometric_punches).toBe(2);
  });

  it("payroll readiness widget shows attendance and long-leave warnings", async () => {
    const result = await getSummary(fakeEnv(), actor());
    expect(result.data.payroll_readiness?.missing_punches).toBe(0);
    expect(result.data.payroll_readiness?.long_leave_payroll_review).toBe(2);
    expect(result.data.payroll_readiness?.unfinalized_payroll_warning).toBe(true);
  });

  it("outlet-scoped user only sees scoped dashboard data", async () => {
    const result = await getSummary(fakeEnv(), actor({ isAdmin: false, roleKeys: ["outlet_manager"], outletIds: ["outlet_1"], permissions: ["dashboard.view", "dashboard.view_outlet", "dashboard.attendance.view"] }));
    expect(result.meta.scope).toBe("outlet");
    expect(result.meta.outlet_ids).toEqual(["outlet_1"]);
  });

  it("approval inbox role-based count applies outlet scope", async () => {
    const { env, calls } = captureEnv({ first: () => ({ total: 1 }) });
    await approvalInboxCount(env, actor({
      isAdmin: false,
      roleKeys: ["outlet_manager"],
      outletIds: ["outlet_1"],
      permissions: ["leave.approvals.view"],
    }));

    const approvalCall = calls.find((call) => call.sql.includes("FROM leave_approval_steps"));
    expect(approvalCall?.sql).toContain("LEFT JOIN leave_requests");
    expect(approvalCall?.sql).toContain("LEFT JOIN employees");
    expect(approvalCall?.sql).toContain("s.approver_role_key IN");
    expect(approvalCall?.sql).toContain("e.primary_outlet_id IN");
    expect(approvalCall?.values).toContain("outlet_1");
  });

  it("approval inbox assigned user count still works without role outlet scope", async () => {
    const { env, calls } = captureEnv({ first: () => ({ total: 1 }) });
    await approvalInboxCount(env, actor({
      isAdmin: false,
      actorUserId: "assigned_user",
      roleKeys: [],
      outletIds: [],
      permissions: ["leave.approvals.view"],
    }));

    const approvalCall = calls.find((call) => call.sql.includes("FROM leave_approval_steps"));
    expect(approvalCall?.sql).toContain("s.approver_user_id = ?");
    expect(approvalCall?.values).toContain("assigned_user");
  });

  it("approval inbox delegated user count still works", async () => {
    const { env, calls } = captureEnv({ first: () => ({ total: 1 }) });
    await approvalInboxCount(env, actor({
      isAdmin: false,
      actorUserId: "delegate_user",
      roleKeys: [],
      outletIds: [],
      permissions: ["leave.approvals.view"],
    }));

    const approvalCall = calls.find((call) => call.sql.includes("FROM leave_approval_steps"));
    expect(approvalCall?.sql).toContain("s.delegated_to = ?");
    expect(approvalCall?.values).toContain("delegate_user");
  });

  it("Super Admin approval inbox count remains company-wide", async () => {
    const { env, calls } = captureEnv({ first: () => ({ total: 3 }) });
    await approvalInboxCount(env, actor({
      isSuperAdmin: true,
      isAdmin: false,
      roleKeys: ["super_admin"],
      outletIds: [],
      permissions: [],
    }));

    const approvalCall = calls.find((call) => call.sql.includes("FROM leave_approval_steps"));
    expect(approvalCall?.sql).not.toContain("e.primary_outlet_id IN");
  });

  it("expiry dashboard view_own returns own counts only", async () => {
    const { env, calls } = captureEnv({
      first: (sql) => {
        if (sql.includes("FROM users")) return { employee_id: "emp_own" };
        if (sql.includes("FROM expiry_alerts a")) return { critical: 1, due_today: 1, due_within_7_days: 1, due_within_30_days: 1, overdue: 0, passport: 1, work_permit: 0, contract: 0, probation: 0, document: 0 };
        return rowForSql(sql);
      },
    });
    const result = await getSummary(env, actor({
      isAdmin: false,
      roleKeys: ["employee"],
      permissions: ["dashboard.view", "expiry_alerts.view_own"],
      outletIds: ["outlet_1"],
    }));

    const expiryCall = calls.find((call) => call.sql.includes("FROM expiry_alerts a"));
    expect(result.data.expiry_alerts?.critical_alerts).toBe(1);
    expect(expiryCall?.sql).toContain("a.employee_id = ?");
    expect(expiryCall?.values).toContain("emp_own");
  });

  it("expiry dashboard view_own with no employee link returns zero counts", async () => {
    const { env, calls } = captureEnv({
      first: (sql) => {
        if (sql.includes("FROM users")) return { employee_id: null };
        return rowForSql(sql);
      },
    });
    const result = await getSummary(env, actor({
      isAdmin: false,
      roleKeys: ["employee"],
      permissions: ["dashboard.view", "expiry_alerts.view_own"],
      outletIds: ["outlet_1"],
    }));

    expect(result.data.expiry_alerts?.critical_alerts).toBe(0);
    expect(calls.some((call) => call.sql.includes("FROM expiry_alerts a"))).toBe(false);
  });

  it("Employee 360 alerts tab blocks view_own access to another employee", async () => {
    const { env } = captureEnv({
      first: (sql) => {
        if (sql.includes("FROM users")) return { employee_id: "emp_1" };
        return null;
      },
    });

    await expect(getEmployeeProfileAlerts(env, actor({
      isAdmin: false,
      actorUserId: "employee_user",
      roleKeys: ["employee"],
      permissions: ["expiry_alerts.view_own"],
      outletIds: ["outlet_1"],
    }), "emp_2")).rejects.toThrow(/own employee profile|permission/i);
  });

  it("Employee 360 alerts tab allows view_own for linked employee", async () => {
    const { env } = captureEnv({
      first: (sql) => {
        if (sql.includes("FROM users")) return { employee_id: "emp_1" };
        if (sql.includes("FROM employees e")) return employeeRow();
        return null;
      },
      all: (sql) => {
        if (sql.includes("FROM expiry_alerts")) return [{ id: "alert_1", status: "open", severity: "critical" }];
        return [];
      },
    });

    const result = await getEmployeeProfileAlerts(env, actor({
      isAdmin: false,
      actorUserId: "employee_user",
      roleKeys: ["employee"],
      permissions: ["expiry_alerts.view_own"],
      outletIds: [],
    }), "emp_1");

    expect(result.open_count).toBe(1);
    expect(result.critical_count).toBe(1);
  });

  it("HR with expiry_alerts.view can open allowed employee alerts tab", async () => {
    const { env } = captureEnv({
      first: (sql) => (sql.includes("FROM employees e") ? employeeRow() : null),
      all: (sql) => (sql.includes("FROM expiry_alerts") ? [{ id: "alert_1", status: "open", severity: "normal" }] : []),
    });

    const result = await getEmployeeProfileAlerts(env, actor({
      isAdmin: false,
      roleKeys: ["hr"],
      permissions: ["expiry_alerts.view"],
      outletIds: ["outlet_1"],
    }), "emp_1");

    expect(result.open_count).toBe(1);
  });

  it("outlet-scoped manager cannot view another outlet employee profile", async () => {
    const { env } = captureEnv({
      first: (sql) => (sql.includes("FROM employees e") ? employeeRow({ id: "emp_2", primary_outlet_id: "outlet_2" }) : null),
    });

    await expect(getEmployeeProfileAlerts(env, actor({
      isAdmin: false,
      roleKeys: ["outlet_manager"],
      permissions: ["expiry_alerts.view"],
      outletIds: ["outlet_1"],
    }), "emp_2")).rejects.toThrow(/outlet|access/i);
  });

  it("quick actions are permission-aware", () => {
    const result = getQuickActions(actor({ permissions: ["dashboard.view", "employees.view"] }));
    expect(result.data.map((action) => action.key)).toEqual(["employee-360"]);
  });

  it("dashboard route/page exists", async () => {
    const router = await readSource("frontend/src/app/router.tsx");
    const page = await readSource("frontend/src/features/dashboard/DashboardPage.tsx");
    expect(router).toContain("/dashboard");
    expect(page).toContain("Payroll Readiness");
    expect(page).toContain("Employee 360");
  });

  it("Employee 360 route/page exists", async () => {
    const router = await readSource("frontend/src/app/router.tsx");
    const page = await readSource("frontend/src/features/employees/Employee360Page.tsx");
    expect(router).toContain("/employees/:employeeId");
    expect(page).toContain("Assets/Uniforms");
  });

  it("employee profile endpoints are missing unsafe metadata fields", async () => {
    const service = await readSource("src/modules/employees/employees.service.ts");
    const page = await readSource("frontend/src/features/employees/Employee360Page.tsx");
    expect(service).not.toContain("raw_payload_json");
    expect(page).not.toContain("metadata_json");
  });

  it("payroll readiness requires permission", async () => {
    const routes = await readSource("src/routes/employees.routes.ts");
    expect(routes).toContain("/:id/profile/payroll-readiness");
    expect(routes).toContain("dashboard.payroll_readiness.view");
  });
});
