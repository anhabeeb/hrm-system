import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import app from "../src/app";
import { getCommandCenter } from "../src/modules/dashboard/dashboard.service";
import type { AuthActor } from "../src/types/api.types";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

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
    "employees.view",
    "attendance.view",
    "attendance.reports.view",
    "approvals.view",
    "payroll.view",
    "documents.view",
    "expiry_alerts.view",
    "rosters.view",
    "employeeLifecycle.exitRequests.viewAll",
    "employeeDiscipline.actions.view",
    "operationOwnership.view",
    "audit_logs.view",
  ],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const commandCenterEnv = () => {
  const calls: Array<{ sql: string; values: unknown[]; method: "first" | "all" }> = [];
  const all = (sql: string) => {
    if (sql.includes("FROM feature_settings")) {
      return [
        { feature_key: "employee_management" },
        { feature_key: "attendance" },
        { feature_key: "leave_management" },
        { feature_key: "approvals" },
        { feature_key: "payroll" },
        { feature_key: "advance_salary" },
        { feature_key: "documents_kyc" },
        { feature_key: "roster" },
        { feature_key: "employee_structure_changes" },
        { feature_key: "resignation_offboarding" },
        { feature_key: "disciplinary_actions" },
        { feature_key: "operation_ownership" },
      ];
    }
    if (sql.includes("FROM approval_requests r")) {
      return [
        ...Array.from({ length: 2 }, (_, index) => ({ id: `leave_${index}`, operation_type: "LEAVE_REQUEST", oldest_submitted_at: "2026-06-01", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `roster_${index}`, operation_type: "ROSTER_CHANGE", oldest_submitted_at: "2026-06-02", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 4 }, (_, index) => ({ id: `doc_${index}`, operation_type: "DOCUMENT_KYC_UPDATE", oldest_submitted_at: "2026-06-03", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 5 }, (_, index) => ({ id: `advance_${index}`, operation_type: "ADVANCE_SALARY_REQUEST", oldest_submitted_at: "2026-06-04", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 6 }, (_, index) => ({ id: `structure_${index}`, operation_type: "EMPLOYEE_STRUCTURE_CHANGE", oldest_submitted_at: "2026-06-05", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 7 }, (_, index) => ({ id: `offboarding_${index}`, operation_type: "OFFBOARDING", oldest_submitted_at: "2026-06-06", assigned_approver_user_id: null, required_permission: null })),
        ...Array.from({ length: 8 }, (_, index) => ({ id: `discipline_${index}`, operation_type: "DISCIPLINARY_ACTION", oldest_submitted_at: "2026-06-07", assigned_approver_user_id: null, required_permission: null })),
      ];
    }
    if (sql.includes("FROM audit_logs a")) return [{ id: "audit_1", module: "employees", action: "employee_created", severity: "info", entity_type: "employee", entity_id: "emp_1", created_at: "2026-06-16T00:00:00Z" }];
    if (sql.includes("GROUP BY e.department_id")) return [{ department_id: "dept_1", department_name: "Operations", total: 12 }];
    if (sql.includes("GROUP BY e.primary_outlet_id")) return [];
    if (sql.includes("FROM holidays h")) return [];
    return [];
  };
  const first = (sql: string) => {
    if (sql.includes("FROM employees e") && sql.includes("employees_without_login")) return { new_hires_this_month: 2, employees_without_login: 3, employees_without_structure: 4, employees_missing_level: 5 };
    if (sql.includes("FROM employees e") && sql.includes("total_active")) return { total_active: 20, local_employees: 10, foreign_employees: 10, probation: 1, on_leave: 0, on_long_leave: 0 };
    if (sql.includes("FROM leave_requests l") && sql.includes("COUNT(DISTINCT l.employee_id) AS on_leave")) return { on_leave: 6, sick: 2 };
    if (sql.includes("FROM attendance_corrections c")) return { total: 7 };
    if (sql.includes("FROM attendance_daily_summary s") && sql.includes("present_today")) return { present_today: 15, absent_today: 1, late_checkins: 2, missing_checkin: 1, missing_checkout: 1, overtime_today: 0, holiday_work_today: 0 };
    if (sql.includes("FROM employee_kyc_update_requests r")) return { pending_kyc_updates: 9, pending_document_approvals: 10 };
    if (sql.includes("date(?, ?)") && sql.includes("FROM expiry_alerts a")) return { total: 11 };
    if (sql.includes("FROM expiry_alerts a")) return { critical: 1, due_today: 0, due_within_7_days: 2, due_within_30_days: 3, overdue: 0, passport: 0, work_permit: 0, contract: 0, probation: 0, document: 0 };
    if (sql.includes("FROM roster_shifts rs")) return { scheduled_today: 12, open_shifts: 1 };
    if (sql.includes("FROM roster_change_requests r")) return { total: 13 };
    if (sql.includes("LEFT JOIN roster_shifts rs")) return { total: 14 };
    if (sql.includes("FROM roster_conflicts rc")) return { total: 15, holiday_roster_warnings: 0, open_roster_conflicts: 15 };
    if (sql.includes("FROM employee_exit_requests r")) return { employees_in_notice_period: 16, final_settlement_review_pending: 17, access_disable_review_pending: 18, exit_interviews_pending: 19 };
    if (sql.includes("FROM employee_offboarding_tasks t")) return { total: 20 };
    if (sql.includes("FROM employee_disciplinary_action_requests r")) return { pending_reviews: 21, pending_acknowledgements: 22, high_severity_cases_pending: 23 };
    if (sql.includes("FROM employee_disciplinary_follow_up_tasks t")) return { total: 24 };
    if (sql.includes("FROM operation_catalog oc")) return { operations_missing_owner: 25, operations_missing_final_approver: 26, operations_missing_executor: 27, operations_using_super_admin_fallback: 28, operations_blocked_by_fallback: 29, functions_without_assigned_users: 30 };
    if (sql.includes("FROM payroll_adjustment_requests par")) return { total: 31 };
    if (sql.includes("FROM advance_salary_requests asr")) return { total: 32 };
    if (sql.includes("FROM payslips p")) return { total: 4, generated: 3 };
    if (sql.includes("FROM payroll_runs")) return { unfinalized: 1, current_payroll_period: "2026-06", pay_date: null, locked_or_finalized: 1, latest_status: "draft" };
    return {};
  };
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            calls.push({ sql, values, method: "first" });
            return first(sql);
          },
          all: async () => {
            calls.push({ sql, values, method: "all" });
            return { results: all(sql) };
          },
        }),
      }),
    },
  } as unknown as Env;
  return { env, calls };
};

describe("Admin Command Center dashboard", () => {
  it("Admin Command Center page renders with Phase 1 dashboard foundation widgets", () => {
    const page = read("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");

    expect(page).toContain("CommandCenterHeader");
    expect(page).toContain("DashboardGrid");
    expect(page).toContain("WidgetCard");
    expect(page).toContain("PeopleSnapshotWidget");
    expect(page).toContain("AttendancePulseWidget");
    expect(page).toContain("ApprovalCommandQueueWidget");
    expect(page).toContain("PayrollReadinessWidget");
    expect(page).toContain("DocumentExpiryWidget");
    expect(page).toContain("RosterCoverageWidget");
    expect(page).toContain("OperationOwnershipHealthWidget");
    expect(page).toContain("RecentActivityWidget");
  });

  it("command header renders date, summary metrics, and permission-filtered quick actions", () => {
    const header = read("frontend/src/features/dashboard/CommandCenterHeader.tsx");
    const service = read("src/modules/dashboard/dashboard.service.ts");

    expect(header).toContain("Welcome back");
    expect(header).toContain("Present Today");
    expect(header).toContain("Pending Approvals");
    expect(header).toContain("quick_actions");
    expect(service).toContain("visibleActions(actor, features");
    expect(service).toContain("Add employee");
    expect(service).toContain("Operation Ownership setup");
  });

  it("disabled attendance hides Attendance Pulse and disabled modules hide their widgets", () => {
    const service = read("src/modules/dashboard/dashboard.service.ts");

    expect(service).toContain('const attendanceEnabled = moduleEnabled(features, "attendance")');
    expect(service).toContain('const payrollEnabled = moduleEnabled(features, "payroll")');
    expect(service).toContain('const documentsEnabled = moduleEnabled(features, "documents_kyc")');
    expect(service).toContain('const rosterEnabled = moduleEnabled(features, "roster")');
    expect(service).toContain('const lifecycleEnabled = moduleEnabled(features, "resignation_offboarding")');
    expect(service).toContain('const disciplineEnabled = moduleEnabled(features, "disciplinary_actions")');
    expect(service).toContain('const operationOwnershipEnabled = moduleEnabled(features, "operation_ownership")');
    expect(service).toContain('attendance_pulse: widget("Attendance Pulse", attendanceEnabled, canViewAttendance');
  });

  it("missing payroll permission hides Payroll Readiness and sensitive widgets require permissions", () => {
    const service = read("src/modules/dashboard/dashboard.service.ts");

    expect(service).toContain('can(actor, ["payroll.view", "dashboard.payroll_readiness.view"])');
    expect(service).toContain('can(actor, ["employeeDiscipline.actions.view"');
    expect(service).toContain('can(actor, ["employeeLifecycle.exitRequests.viewAll"');
    expect(service).toContain('payroll_readiness: widget("Payroll Readiness", payrollEnabled && payrollSalaryProcessingEnabled, canViewPayroll');
    expect(service).toContain('disciplinary_follow_up: widget("Disciplinary Follow-up", disciplineEnabled, canViewDiscipline');
  });

  it("standalone Super Admin sees admin widgets but no self-service widgets", () => {
    const page = read("frontend/src/features/dashboard/AdminCommandCenterPage.tsx");
    const service = read("src/modules/dashboard/dashboard.service.ts");

    expect(page).not.toContain("self/dashboard");
    expect(page).not.toContain("My Profile");
    expect(page).not.toContain("My Requests");
    expect(service).toContain("actor.isSuperAdmin || actor.isAdmin");
    expect(service).not.toContain("/self/");
  });

  it("widget actions hide disabled routes and approval queue rows hide disabled module approvals", () => {
    const service = read("src/modules/dashboard/dashboard.service.ts");

    expect(service).toContain("visibleActions(actor, features");
    expect(service).toContain("countApprovalRow");
    expect(service).toContain("enabled && visible");
    expect(service).toContain('countApprovalRow("discipline"');
    expect(service).toContain('countApprovalRow("offboarding"');
  });

  it("backend command center route requires authentication", async () => {
    const response = await app.request("/api/v1/dashboard/command-center", {}, {
      ENVIRONMENT: "test",
      DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) }) },
    } as unknown as Env);

    expect(response.status).toBe(401);
  });

  it("command-center UI hardening keeps alerts, confirms, and dark mode out", () => {
    const source = [
      "frontend/src/features/dashboard/AdminCommandCenterPage.tsx",
      "frontend/src/features/dashboard/CommandCenterHeader.tsx",
      "frontend/src/features/dashboard/PeopleSnapshotWidget.tsx",
      "frontend/src/features/dashboard/AttendancePulseWidget.tsx",
      "frontend/src/features/dashboard/ApprovalCommandQueueWidget.tsx",
      "frontend/src/features/dashboard/PayrollReadinessWidget.tsx",
      "frontend/src/features/dashboard/DocumentExpiryWidget.tsx",
      "frontend/src/features/dashboard/RosterCoverageWidget.tsx",
      "frontend/src/features/dashboard/DepartmentHealthWidget.tsx",
      "frontend/src/features/dashboard/EmployeeAttentionWidget.tsx",
      "frontend/src/features/dashboard/LifecycleWidget.tsx",
      "frontend/src/features/dashboard/DisciplinaryFollowUpWidget.tsx",
      "frontend/src/features/dashboard/OperationOwnershipHealthWidget.tsx",
      "frontend/src/features/dashboard/RecentActivityWidget.tsx",
    ].map(read).join("\n");

    expect(source).not.toMatch(/\b(?:window\.)?alert\s*\(/);
    expect(source).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    expect(source).not.toMatch(/\bdarkMode\b|\bdark:[\w-]/);
  });

  it("uses real scoped aggregate queries for people, payroll, lifecycle, discipline, and operation ownership", async () => {
    const { env, calls } = commandCenterEnv();
    const result = await getCommandCenter(env, actor());
    const widgets = result.data.widgets;

    expect(widgets.people_snapshot.metrics).toMatchObject({ new_hires_this_month: 2, employees_without_login: 3, employees_without_structure: 4, employees_missing_level: 5 });
    expect(widgets.payroll_readiness.metrics).toMatchObject({ approved_advances_deductions: 32, pending_payroll_adjustments: 31, payslip_generation_status: "3/4 generated", payroll_locked_or_finalized: true });
    expect(widgets.lifecycle.metrics).toMatchObject({ employees_in_notice_period: 16, offboarding_tasks_pending: 20, final_settlement_review_pending: 17, access_disable_review_pending: 18, exit_interviews_pending: 19 });
    expect(widgets.disciplinary_follow_up.metrics).toMatchObject({ pending_reviews: 21, pending_acknowledgements: 22, open_follow_up_tasks: 24, high_severity_cases_pending: 23 });
    expect(widgets.operation_ownership_health.metrics).toMatchObject({ operations_missing_owner: 25, operations_missing_final_approver: 26, operations_missing_executor: 27, operations_using_super_admin_fallback: 28, operations_blocked_by_fallback: 29, functions_without_assigned_users: 30 });
    expect(calls.some((call) => call.sql.includes("LEFT JOIN users u") && call.sql.includes("employees_without_login"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("operation_responsibility_matrix"))).toBe(true);
  });

  it("approval queue counts come from approval request operation data instead of proxy module counts", async () => {
    const { env, calls } = commandCenterEnv();
    const result = await getCommandCenter(env, actor());
    const rows = result.data.widgets.approval_queue.rows as Array<{ id: string; count: number }>;
    const byId = new Map(rows.map((row) => [row.id, row.count]));

    expect(byId.get("document-kyc")).toBe(4);
    expect(byId.get("roster-change")).toBe(3);
    expect(byId.get("offboarding")).toBe(7);
    expect(byId.get("advance-salary")).toBe(5);
    expect(byId.get("employee-structure")).toBe(6);
    expect(byId.get("discipline")).toBe(8);
    expect(calls.some((call) => call.sql.includes("FROM approval_requests r") && call.sql.includes("r.operation_type IN"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("s.required_permission IN"))).toBe(false);
  });

  it("command-center approval queue avoids huge permission bind lists for users with hundreds of permissions", async () => {
    const { env, calls } = commandCenterEnv();
    const manyPermissionActor = actor({
      isAdmin: false,
      roleKeys: ["custom_role"],
      outletIds: ["outlet_1"],
      permissions: ["approvals.view", ...Array.from({ length: 600 }, (_, index) => `permission.${index}`)],
    });

    await getCommandCenter(env, manyPermissionActor);
    const approvalCalls = calls.filter((call) => call.sql.includes("FROM approval_requests r"));

    expect(approvalCalls.length).toBeGreaterThan(0);
    expect(approvalCalls.every((call) => call.values.length <= 50)).toBe(true);
    expect(approvalCalls.some((call) => call.sql.includes("s.required_permission IN"))).toBe(false);
  });

  it("one command-center widget failure does not crash the whole dashboard", async () => {
    const { env } = commandCenterEnv();
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = ((sql: string) => {
      if (sql.includes("FROM employee_kyc_update_requests r")) {
        return {
          bind: () => ({
            first: async () => {
              throw new Error("D1_ERROR: widget unavailable");
            },
            all: async () => ({ results: [] }),
          }),
        };
      }
      return originalPrepare(sql);
    }) as Env["DB"]["prepare"];

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await getCommandCenter(env, actor());
      expect(result.data.widgets.document_expiry.error).toBe("unavailable");
      expect(result.data.warnings).toContain("document KYC is temporarily unavailable.");
      expect(result.data.widgets.people_snapshot.visible).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("document, roster, attendance, and recent activity widgets use their own data sources", async () => {
    const { env, calls } = commandCenterEnv();
    const result = await getCommandCenter(env, actor());

    expect(result.data.widgets.document_expiry.metrics).toMatchObject({ expiring_30_days: 3, expiring_60_days: 11, pending_kyc_updates: 9, pending_document_approvals: 10 });
    expect(result.data.widgets.roster_coverage.metrics).toMatchObject({ scheduled_today: 12, open_shifts: 1, employees_on_leave_today: 6, roster_conflicts: 15, unassigned_employees: 14, pending_roster_changes: 13 });
    expect(result.data.widgets.attendance_pulse.metrics).toMatchObject({ on_leave: 6, sick: 2, pending_corrections: 7 });
    expect(result.data.widgets.recent_activity.rows).toEqual([
      expect.objectContaining({ id: "audit_1", title: "employees employee_created" }),
    ]);
    expect(calls.some((call) => call.sql.includes("FROM employee_kyc_update_requests r"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("FROM roster_change_requests r"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("FROM audit_logs a"))).toBe(true);
  });
});
