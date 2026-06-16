import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findDepartment: vi.fn(),
    findActorLinkedEmployee: vi.fn(),
    listDepartmentEmployeesForWeek: vi.fn(),
    listActiveDepartmentsForWeeklyTeam: vi.fn(),
  },
  attendanceRepository: {
    listDailySummaries: vi.fn(),
    listAttendanceEvents: vi.fn(),
    listApprovedLeaves: vi.fn(),
    listAttendanceCorrections: vi.fn(),
    listRosterShifts: vi.fn(),
    listHolidays: vi.fn(),
  },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
  },
  settings: {
    isFeatureEnabled: vi.fn(),
  },
}));

vi.mock("../src/modules/dashboard/department-weekly-team.repository", () => mocks.repository);
vi.mock("../src/modules/attendance/attendance-calendar.repository", () => mocks.attendanceRepository);
vi.mock("../src/services/permission.service", () => mocks.permissions);
vi.mock("../src/services/settings.service", () => mocks.settings);

import { getDepartmentWeeklyTeamView, listWeeklyTeamDepartments, resolveTeamDayStatus } from "../src/modules/dashboard/department-weekly-team.service";
import { resolveEmployeeNavigation } from "../src/modules/self-service/self-service.service";
import type { AuthActor } from "../src/types/api.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const env = {} as Env;

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_manager",
  fullName: "Manager User",
  email: "manager@example.test",
  roles: ["Manager"],
  roleKeys: ["manager"],
  permissions: ["department.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "employees.team.view"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  requestId: "req_test",
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const managerEmployee = {
  id: "manager_emp",
  employee_code: "MGR",
  full_name: "Mina Manager",
  department_id: "dept_ops",
  department_name: "Operations",
  position_id: "pos_mgr",
  position_name: "Manager",
  level: 3,
  primary_outlet_id: "outlet_1",
  joined_at: "2020-01-01",
  resigned_at: null,
  terminated_at: null,
  employment_status: "active",
  deleted_at: null,
  archived_at: null,
};

const employee = {
  ...managerEmployee,
  id: "emp_1",
  employee_code: "EMP001",
  full_name: "Ahmed Staff",
  position_id: "pos_staff",
  position_name: "Staff",
  level: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.isSuperAdmin || context.permissions.includes(permission));
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.settings.isFeatureEnabled.mockResolvedValue(true);
  mocks.repository.findDepartment.mockResolvedValue({ id: "dept_ops", name: "Operations" });
  mocks.repository.findActorLinkedEmployee.mockResolvedValue(managerEmployee);
  mocks.repository.listDepartmentEmployeesForWeek.mockResolvedValue([employee]);
  mocks.repository.listActiveDepartmentsForWeeklyTeam.mockResolvedValue([{ id: "dept_ops", name: "Operations" }, { id: "dept_hr", name: "HR" }]);
  mocks.attendanceRepository.listDailySummaries.mockResolvedValue([{ attendance_date: "2026-06-15", status: "present", first_clock_in: "08:00", last_clock_out: "16:00", late_minutes: 0, worked_minutes: 480 }]);
  mocks.attendanceRepository.listAttendanceEvents.mockResolvedValue([]);
  mocks.attendanceRepository.listApprovedLeaves.mockResolvedValue([]);
  mocks.attendanceRepository.listAttendanceCorrections.mockResolvedValue([]);
  mocks.attendanceRepository.listRosterShifts.mockResolvedValue([{ id: "shift_1", shift_date: "2026-06-15", shift_name: "Morning", start_time: "08:00", end_time: "16:00", status: "scheduled" }]);
  mocks.attendanceRepository.listHolidays.mockResolvedValue([]);
});

describe("Department Dashboard weekly team view", () => {
  it("backend weekly team endpoint requires authentication and module guards", () => {
    const routes = read("src/routes/departments.routes.ts");
    const selfRoutes = read("src/routes/self-service.routes.ts");

    expect(routes).toContain("authMiddleware");
    expect(routes).toContain('"/weekly-team-view"');
    expect(routes).toContain('requireFeature("employee_management")');
    expect(routes).toContain('requireFeature("attendance")');
    expect(selfRoutes).toContain('"/department-dashboard/weekly-team-view"');
    expect(selfRoutes).toContain('requireFeature("employee_management"), requireFeature("attendance")');
  });

  it("manager can view own lower-level department employees", async () => {
    const result = await getDepartmentWeeklyTeamView(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });

    expect(result.department.name).toBe("Operations");
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].cells).toHaveLength(7);
    expect(mocks.repository.listDepartmentEmployeesForWeek).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      departmentId: "dept_ops",
      scope: "team",
      actorEmployee: expect.objectContaining({ id: "manager_emp" }),
    }));
  });

  it("manager cannot view another department", async () => {
    await expect(getDepartmentWeeklyTeamView(env, actor(), { department_id: "dept_other", week_start: "2026-06-15" })).rejects.toMatchObject({
      message: "You do not have permission to view this department.",
    });
  });

  it("HR/Admin with viewAll can view all departments", async () => {
    await getDepartmentWeeklyTeamView(env, actor({ isAdmin: true, permissions: ["departments.dashboard.viewAll"] }), { department_id: "dept_ops", week_start: "2026-06-15" });

    expect(mocks.repository.listDepartmentEmployeesForWeek).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ scope: "all" }));
  });

  it("disabled Attendance module blocks endpoint", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "attendance");

    await expect(getDepartmentWeeklyTeamView(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" })).rejects.toMatchObject({
      message: "This module is currently disabled.",
    });
  });

  it("disabled Employee Management module blocks self-service weekly team route", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => !["employees", "employee_management"].includes(feature));

    await expect(getDepartmentWeeklyTeamView(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15", self_service: true })).rejects.toMatchObject({
      message: "This module is currently disabled.",
    });
  });

  it("scoped department selector lets team manager load own department without departments.view", async () => {
    const managerDepartments = await listWeeklyTeamDepartments(env, actor({ permissions: ["departments.dashboard.viewTeam"] }));
    expect(managerDepartments).toEqual([{ id: "dept_ops", name: "Operations" }]);

    const adminDepartments = await listWeeklyTeamDepartments(env, actor({ isAdmin: true, permissions: ["departments.dashboard.viewAll"] }));
    expect(adminDepartments).toHaveLength(2);
    expect(mocks.repository.listActiveDepartmentsForWeeklyTeam).toHaveBeenCalled();
  });

  it("self-service navigation is linked, module, and team-permission aware", () => {
    const linkedProfile = {
      linked_employee: true,
      user: { id: "user_manager", username: null, email: null, full_name: "Manager", status: "active" },
      employee: { id: "manager_emp", employee_code: "MGR", full_name: "Manager", department_id: "dept_ops", department_name: "Operations", position_id: null, position_title: null, level: 3, outlet_id: null, outlet_name: null, employment_status: "active", employment_type: null, employee_type: null, nationality: null, email: null, phone: null },
      roles: [],
      access_summary: [],
    };
    const item = resolveEmployeeNavigation(actor({ permissions: ["attendance.teamCalendar.view"] }), linkedProfile, new Set(["employee_management", "attendance"]))
      .find((entry) => entry.key === "department-dashboard");
    expect(item?.enabled).toBe(true);

    const disabled = resolveEmployeeNavigation(actor({ permissions: ["attendance.teamCalendar.view"] }), linkedProfile, new Set(["employee_management"]))
      .find((entry) => entry.key === "department-dashboard");
    expect(disabled?.enabled).toBe(false);
  });

  it("leave/sick days are not marked absent and pending correction appears", () => {
    expect(resolveTeamDayStatus({ active: true, leave: { leave_key: "sick_leave" }, events: [] })).toBe("SICK");
    expect(resolveTeamDayStatus({ active: true, leave: { leave_key: "annual" }, events: [] })).toBe("LEAVE");
    expect(resolveTeamDayStatus({ active: true, correction: { status: "pending" }, events: [] })).toBe("PENDING_CORRECTION");
    expect(resolveTeamDayStatus({ active: true, shift: { status: "day_off" }, events: [] })).toBe("DAY_OFF");
    expect(resolveTeamDayStatus({ active: true, holiday: { id: "holiday_1" }, events: [] })).toBe("HOLIDAY");
    expect(resolveTeamDayStatus({ active: true, summary: { status: "missing_clock_out" }, events: [] })).toBe("MISSING_PUNCH");
  });

  it("holiday date marks week header and cells as holiday", async () => {
    mocks.attendanceRepository.listDailySummaries.mockResolvedValue([]);
    mocks.attendanceRepository.listRosterShifts.mockResolvedValue([]);
    mocks.attendanceRepository.listHolidays.mockResolvedValue([{ id: "holiday_1", start_date: "2026-06-16", end_date: "2026-06-16", holiday_name: "Founders Day" }]);

    const result = await getDepartmentWeeklyTeamView(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });

    expect(result.week.days.find((day) => day.date === "2026-06-16")?.is_holiday).toBe(true);
    expect(result.employees[0].cells.find((cell) => cell.date === "2026-06-16")?.status).toBe("HOLIDAY");
  });

  it("standalone Super Admin cannot use self-service department dashboard route", () => {
    const routes = read("src/routes/self-service.routes.ts");
    const router = read("frontend/src/app/router.tsx");

    expect(routes).toContain("requireLinkedEmployeeForSelfService");
    expect(routes).toContain('"/department-dashboard/weekly-team-view"');
    expect(router).toContain('path="/self/department-dashboard"');
    expect(router).toContain("requiresLinkedEmployee: true");
  });

  it("frontend renders weekly matrix, controls, detail drawer, and scoped navigation", () => {
    expect(read("frontend/src/features/department-dashboard/DepartmentDashboardPage.tsx")).toContain("LinkedEmployeeOnlyGuard");
    expect(read("frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx")).toContain("DepartmentWeeklyMatrix");
    expect(read("frontend/src/features/department-dashboard/DepartmentTeamFilters.tsx")).toContain("Previous week");
    expect(read("frontend/src/features/department-dashboard/DepartmentWeeklyMatrix.tsx")).toContain("<table");
    expect(read("frontend/src/features/department-dashboard/DepartmentWeeklyDayCell.tsx")).toContain("onOpen");
    expect(read("frontend/src/features/department-dashboard/DepartmentDayDetailDrawer.tsx")).toContain("fixed inset-y-0 right-0");
    expect(read("frontend/src/lib/navigation.ts")).toContain("moduleCodesAll: [\"employees\", \"attendance\"]");
    expect(read("frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx")).toContain("departmentWeeklyTeamApi.departments");
    expect(read("frontend/src/features/department-dashboard/departmentWeeklyTeam.api.ts")).toContain("/departments/weekly-team-departments");
  });

  it("no alert/confirm, dark mode, or full roster edit matrix was added", () => {
    const source = [
      "frontend/src/features/department-dashboard/DepartmentDashboardPage.tsx",
      "frontend/src/features/department-dashboard/DepartmentWeeklyTeamView.tsx",
      "frontend/src/features/department-dashboard/DepartmentWeeklyMatrix.tsx",
      "frontend/src/features/department-dashboard/DepartmentWeeklyDayCell.tsx",
      "frontend/src/features/department-dashboard/DepartmentDayDetailDrawer.tsx",
    ].map(read).join("\n");

    expect(source).not.toMatch(/window\.alert|\balert\(|window\.confirm|\bconfirm\(/);
    expect(source).not.toMatch(/dark:|darkMode|ThemeProvider/);
    expect(source).not.toMatch(/onDrag|drag|drop|create shift/i);
  });
});
