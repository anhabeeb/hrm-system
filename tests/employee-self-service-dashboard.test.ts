import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findSelfProfile: vi.fn(),
    listSelfRoleNames: vi.fn(),
    listEnabledFeatureKeys: vi.fn(),
    getTodayAttendance: vi.fn(),
    getNextRosterShift: vi.fn(),
    getLeaveBalanceSummary: vi.fn(),
    getLeaveRequestCounts: vi.fn(),
    getAttendanceCorrectionCounts: vi.fn(),
    listSelfRequests: vi.fn(),
    listSelfPendingApprovals: vi.fn(),
    getDocumentSummary: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    getLatestPayslip: vi.fn(),
  },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
  },
}));

vi.mock("../src/modules/self-service/self-service.repository", () => mocks.repository);
vi.mock("../src/services/permission.service", () => mocks.permissions);

import * as service from "../src/modules/self-service/self-service.service";
import type { AuthActor } from "../src/types/api.types";

const env = {} as Env;
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_employee",
  fullName: "Employee User",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: [
    "self.dashboard.view",
    "self.profile.view",
    "self.attendance.view",
    "self.roster.view",
    "self.leave.view",
    "self.requests.view",
    "self.documents.view",
    "self.payslips.view",
    "self.accessSummary.view",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  requestId: "req_test",
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const profileRow = {
  user_id: "user_employee",
  username: "emp001",
  user_email: "employee@example.test",
  user_full_name: "Employee User",
  user_status: "active",
  employee_id: "emp_1",
  employee_code: "EMP001",
  employee_name: "Aisha Employee",
  department_id: "dept_ops",
  department_name: "Operations",
  position_id: "pos_staff",
  position_title: "Cashier",
  level: 1,
  outlet_id: "outlet_1",
  outlet_name: "Main Outlet",
  employment_status: "active",
  employment_type: "full_time",
  employee_type: "local",
  nationality: "Maldivian",
  employee_email: "aisha@example.test",
  employee_phone: "7770000",
  archived_at: null,
  deleted_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.isSuperAdmin || context.permissions.includes(permission));
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.repository.findSelfProfile.mockResolvedValue(profileRow);
  mocks.repository.listSelfRoleNames.mockResolvedValue([{ role_name: "Employee Self-Service" }]);
  mocks.repository.listEnabledFeatureKeys.mockResolvedValue(["attendance", "roster", "leave_management", "documents", "payslips", "approvals"]);
  mocks.repository.getTodayAttendance.mockResolvedValue({ status: "present", first_clock_in: "08:00", last_clock_out: null });
  mocks.repository.getNextRosterShift.mockResolvedValue({ shift_date: "2026-06-12", start_time: "08:00", end_time: "16:00" });
  mocks.repository.getLeaveBalanceSummary.mockResolvedValue({ available_days: 12, leave_types: 2 });
  mocks.repository.getLeaveRequestCounts.mockResolvedValue({ pending: 1, approved: 2, rejected: 0 });
  mocks.repository.getAttendanceCorrectionCounts.mockResolvedValue({ pending: 1, failed: 0 });
  mocks.repository.listSelfRequests.mockResolvedValue([
    { id: "req_1", operation_type: "LEAVE_REQUEST", title: "Annual leave", status: "IN_REVIEW", subject_employee_id: "emp_1" },
    { id: "req_2", operation_type: "ATTENDANCE_CORRECTION", title: "Clock-in correction", status: "SUBMITTED", subject_employee_id: "emp_1" },
  ]);
  mocks.repository.listSelfPendingApprovals.mockResolvedValue([]);
  mocks.repository.getDocumentSummary.mockResolvedValue({ uploaded: 3, expiring_soon: 1, expired: 0 });
  mocks.repository.getUnreadNotificationCount.mockResolvedValue({ unread: 2 });
  mocks.repository.getLatestPayslip.mockResolvedValue({ id: "pay_1", payroll_month: "2026-05", status: "generated" });
});

describe("employee self-service dashboard foundation", () => {
  it("registers self-service routes, frontend pages, permissions, and navigation", () => {
    expect(read("src/app.ts")).toContain('apiV1.route("/self", selfServiceRoutes)');
    expect(read("src/routes/self-service.routes.ts")).toContain('selfServiceRoutes.get("/dashboard"');
    expect(read("src/routes/self-service.routes.ts")).toContain("authMiddleware");
    expect(read("src/routes/self-service.routes.ts")).toContain("requireLinkedEmployeeForSelfService");
    expect(read("src/routes/self-service.routes.ts")).toContain("SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED");
    expect(read("frontend/src/app/router.tsx")).toContain("/self/dashboard");
    expect(read("frontend/src/app/router.tsx")).toContain("requiresLinkedEmployee: true");
    expect(read("frontend/src/lib/navigation.ts")).toContain("Self-Service");
    expect(read("frontend/src/lib/navigation.ts")).toContain("requiresLinkedEmployee: true");
    expect(read("seeds/permissions.seed.sql")).toContain("self.dashboard.view");
    expect(read("seeds/permissions.seed.sql")).toContain("department.dashboard.view");
    expect(read("frontend/src/features/self-service/EmployeeDashboardPage.tsx")).not.toMatch(/window\.alert|window\.confirm/);
  });

  it("uses permission-aware landing for login, 2FA, public redirects, index redirects, and permission denied", () => {
    const landing = read("frontend/src/lib/default-landing.ts");
    const login = read("frontend/src/features/auth/LoginPage.tsx");
    const twoFactor = read("frontend/src/features/auth/TwoFactorPage.tsx");
    const guards = read("frontend/src/features/auth/route-guards.tsx");
    const router = read("frontend/src/app/router.tsx");
    const permissionDenied = read("frontend/src/components/feedback/PermissionDenied.tsx");

    expect(landing).toContain("getDefaultLandingPath");
    expect(landing).toContain("dashboard.view_company");
    expect(landing).toContain("user?.employee_id");
    expect(landing).toContain('return "/self/dashboard"');
    expect(login).toContain("getDefaultLandingPath(result.user)");
    expect(twoFactor).toContain("getDefaultLandingPath(user)");
    expect(guards).toContain("getDefaultLandingPath(user)");
    expect(router).toContain("DefaultLandingRedirect");
    expect(permissionDenied).toContain("getDefaultLandingPath(user)");
  });

  it("gates the admin dashboard navigation away from self-service-only users", () => {
    const navigation = read("frontend/src/lib/navigation.ts");

    expect(navigation).toContain('label: "Dashboard", path: "/dashboard"');
    expect(navigation).toContain('requiredPermissionsAny: ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]');
  });

  it("hides self-service navigation and routes from standalone accounts", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");
    const guards = read("frontend/src/features/auth/route-guards.tsx");

    expect(navigation).toContain("!item.requiresLinkedEmployee || Boolean(user?.employee_id)");
    expect(router).toContain('path="/self/dashboard"');
    expect(router).toContain("requiresLinkedEmployee: true");
    expect(guards).toContain("requiresLinkedEmployee && !user?.employee_id");
    expect(guards).toContain('<Navigate to="/dashboard" replace />');
  });

  it("uses professional request empty-state text", () => {
    const shared = read("frontend/src/features/self-service/SelfServiceShared.tsx");

    expect(shared).toContain("No pending requests at the moment.");
    expect(shared).not.toContain("mercifully");
    expect(shared).not.toContain("workflow limbo");
  });

  it("linked employee sees own profile without sensitive auth fields", async () => {
    const result = await service.getSelfProfile(env, actor());

    expect(result.linked_employee).toBe(true);
    expect(result.employee).toMatchObject({ id: "emp_1", department_name: "Operations", position_title: "Cashier", level: 1 });
    expect(JSON.stringify(result)).not.toMatch(/password_hash|session_token|reset_token|totp_secret/i);
  });

  it("user without linked employee is rejected from self-service APIs", async () => {
    mocks.repository.findSelfProfile.mockResolvedValue({ ...profileRow, employee_id: null, deleted_at: null });

    await expect(service.getSelfDashboard(env, actor())).rejects.toMatchObject({
      code: "SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED",
      message: "Self-service is only available for accounts linked to an employee profile.",
    });
  });

  it("standalone Super Admin bypass does not bypass the linked employee requirement", async () => {
    mocks.repository.findSelfProfile.mockResolvedValue({ ...profileRow, employee_id: null, deleted_at: null });

    await expect(service.getSelfProfile(env, actor({
      isSuperAdmin: true,
      roleKeys: ["super_admin"],
      permissions: [],
    }))).rejects.toMatchObject({
      code: "SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED",
    });
  });

  it("normal employee dashboard includes self widgets but not department widgets without permission", async () => {
    const dashboard = await service.getSelfDashboard(env, actor());

    expect(dashboard.widgets.map((widget) => widget.key)).toEqual(expect.arrayContaining(["profile", "attendance", "roster", "leave", "requests", "documents", "notifications", "payslip"]));
    expect(dashboard.widgets.find((widget) => widget.key === "approvals")?.enabled).toBe(false);
    expect(dashboard.requests).toHaveLength(2);
    expect(mocks.repository.listSelfRequests).toHaveBeenCalledWith(expect.anything(), "company_1", "user_employee", "emp_1", 5);
  });

  it("level 3 or 4 user with department permission sees department approval widgets", async () => {
    mocks.repository.findSelfProfile.mockResolvedValue({ ...profileRow, level: 3 });
    mocks.repository.listSelfPendingApprovals.mockResolvedValue([{ id: "req_3", operation_type: "LEAVE_REQUEST", title: "Team leave", status: "IN_REVIEW" }]);

    const dashboard = await service.getSelfDashboard(env, actor({
      permissions: [...actor().permissions, "department.approvals.view", "approvals.department.approve"],
    }));

    expect(dashboard.widgets.find((widget) => widget.key === "approvals")?.enabled).toBe(true);
    expect(dashboard.pending_approvals).toHaveLength(1);
  });

  it("module-disabled widgets are disabled and navigation hides inactive modules", async () => {
    mocks.repository.listEnabledFeatureKeys.mockResolvedValue(["approvals"]);
    const context = actor();

    const dashboard = await service.getSelfDashboard(env, context);
    const navigation = await service.getSelfNavigation(env, context);

    expect(dashboard.widgets.find((widget) => widget.key === "leave")?.enabled).toBe(false);
    expect(navigation.find((item) => item.key === "leave")?.enabled).toBe(false);
  });

  it("does not fetch module widget data when self-service permissions are missing", async () => {
    const context = actor({
      permissions: [
        "self.dashboard.view",
        "self.profile.view",
        "self.requests.view",
        "self.accessSummary.view",
      ],
    });

    const dashboard = await service.getSelfDashboard(env, context);

    expect(dashboard.widgets.find((widget) => widget.key === "attendance")?.description).toBe("You do not have access to this module.");
    expect(dashboard.widgets.find((widget) => widget.key === "roster")?.description).toBe("You do not have access to this module.");
    expect(dashboard.widgets.find((widget) => widget.key === "leave")?.description).toBe("You do not have access to this module.");
    expect(dashboard.widgets.find((widget) => widget.key === "documents")?.description).toBe("You do not have access to this module.");
    expect(dashboard.widgets.find((widget) => widget.key === "payslip")?.description).toBe("You do not have access to this module.");
    expect(mocks.repository.getTodayAttendance).not.toHaveBeenCalled();
    expect(mocks.repository.getNextRosterShift).not.toHaveBeenCalled();
    expect(mocks.repository.getLeaveBalanceSummary).not.toHaveBeenCalled();
    expect(mocks.repository.getLeaveRequestCounts).not.toHaveBeenCalled();
    expect(mocks.repository.getAttendanceCorrectionCounts).not.toHaveBeenCalled();
    expect(mocks.repository.getDocumentSummary).not.toHaveBeenCalled();
    expect(mocks.repository.getLatestPayslip).not.toHaveBeenCalled();
  });

  it("self requests include requests created on behalf of the employee", async () => {
    await service.getSelfRequests(env, actor());

    expect(mocks.repository.listSelfRequests).toHaveBeenCalledWith(expect.anything(), "company_1", "user_employee", "emp_1");
  });

  it("pending approvals only returns eligible or assigned approval rows", async () => {
    await service.getSelfPendingApprovals(env, actor({ permissions: [...actor().permissions, "department.approvals.view", "approvals.department.approve"] }));

    expect(mocks.repository.listSelfPendingApprovals).toHaveBeenCalledWith(expect.anything(), "company_1", "user_employee", expect.objectContaining({ department_id: "dept_ops", level: 1 }), expect.arrayContaining(["approvals.department.approve"]));
  });
});
