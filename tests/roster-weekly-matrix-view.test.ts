import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findActorLinkedEmployee: vi.fn(),
    findDepartment: vi.fn(),
    listRosterMatrixEmployees: vi.fn(),
    listRosterMatrixEmployeeOptions: vi.fn(),
    listRosterMatrixShifts: vi.fn(),
    listRosterMatrixAssignments: vi.fn(),
    listPendingRosterMatrixChanges: vi.fn(),
    listOpenRosterMatrixConflicts: vi.fn(),
    listApprovedLeavesForRosterMatrix: vi.fn(),
    listHolidaysForRosterMatrix: vi.fn(),
    listAttendanceOverlaysForRosterMatrix: vi.fn(),
  },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasPermission: vi.fn(),
  },
  settings: {
    isFeatureEnabled: vi.fn(),
  },
  rosterService: {
    createRosterChangeRequest: vi.fn(),
    submitRosterChangeForApproval: vi.fn(),
    createRosterShift: vi.fn(),
  },
  audit: {
    createAuditLog: vi.fn(),
  },
}));

vi.mock("../src/modules/rosters/roster-weekly-matrix.repository", () => mocks.repository);
vi.mock("../src/services/permission.service", () => mocks.permissions);
vi.mock("../src/services/settings.service", () => mocks.settings);
vi.mock("../src/modules/rosters/rosters.service", () => mocks.rosterService);
vi.mock("../src/services/audit.service", () => mocks.audit);

import { bulkAssignRosterMatrix, detectRosterConflicts, getRosterWeeklyMatrix, saveRosterMatrixDraft, submitRosterMatrixChanges } from "../src/modules/rosters/roster-weekly-matrix.service";
import type { AuthActor } from "../src/types/api.types";

const env = {} as Env;
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_manager",
  fullName: "Manager",
  email: "manager@example.test",
  roles: ["Manager"],
  roleKeys: ["manager"],
  permissions: ["rosters.weeklyMatrix.viewTeam", "rosters.weeklyMatrix.edit", "rosters.weeklyMatrix.submit", "roster.changes.createForOthers"],
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
  outlet_name: "Main",
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

const shift = {
  id: "shift_morning",
  name: "Morning",
  code: "M",
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: 60,
  department_id: "dept_ops",
  outlet_id: "outlet_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.isSuperAdmin || context.permissions.includes(permission));
  mocks.settings.isFeatureEnabled.mockResolvedValue(true);
  mocks.repository.findActorLinkedEmployee.mockResolvedValue(managerEmployee);
  mocks.repository.findDepartment.mockResolvedValue({ id: "dept_ops", name: "Operations" });
  mocks.repository.listRosterMatrixEmployees.mockResolvedValue([employee]);
  mocks.repository.listRosterMatrixEmployeeOptions.mockResolvedValue([{ id: "emp_1", employee_no: "EMP001", name: "Ahmed Staff", department_name: "Operations", position_name: "Staff", level: 1 }]);
  mocks.repository.listRosterMatrixShifts.mockResolvedValue([shift]);
  mocks.repository.listRosterMatrixAssignments.mockResolvedValue([]);
  mocks.repository.listPendingRosterMatrixChanges.mockResolvedValue([]);
  mocks.repository.listOpenRosterMatrixConflicts.mockResolvedValue([]);
  mocks.repository.listApprovedLeavesForRosterMatrix.mockResolvedValue([]);
  mocks.repository.listHolidaysForRosterMatrix.mockResolvedValue([]);
  mocks.repository.listAttendanceOverlaysForRosterMatrix.mockResolvedValue([]);
  mocks.rosterService.createRosterChangeRequest.mockResolvedValue({ roster_change: { id: "roster_change_1" } });
  mocks.rosterService.submitRosterChangeForApproval.mockResolvedValue({ roster_change: { id: "roster_change_1", status: "PENDING_DEPARTMENT_APPROVAL" } });
  mocks.rosterService.createRosterShift.mockResolvedValue({ roster_shift: { id: "roster_shift_1", status: "draft" } });
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
});

describe("Roster Weekly Matrix View", () => {
  it("weekly matrix endpoint requires auth, roster and employee-management modules, and permissions", () => {
    const routes = read("src/routes/rosters.routes.ts");
    expect(routes).toContain("authMiddleware");
    expect(routes).toContain('requireFeature("roster")');
    expect(routes).toContain('requireFeature("employee_management")');
    expect(routes).toContain('"/weekly-matrix"');
    expect(routes).toContain("rosters.weeklyMatrix.viewTeam");
  });

  it("disabled roster module blocks route", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "roster");
    await expect(getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" })).rejects.toMatchObject({
      message: "This module is currently disabled.",
    });
  });

  it("manager can view own department lower-level employees", async () => {
    const result = await getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });
    expect(result.employees).toHaveLength(1);
    expect(mocks.repository.listRosterMatrixEmployees).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      departmentId: "dept_ops",
      scope: "team",
      actorEmployee: expect.objectContaining({ id: "manager_emp" }),
    }));
  });

  it("manager cannot view another department", async () => {
    await expect(getRosterWeeklyMatrix(env, actor(), { department_id: "dept_hr", week_start: "2026-06-15" })).rejects.toMatchObject({
      message: "You do not have permission to view this roster department.",
    });
  });

  it("double booking detected in matrix cells", async () => {
    mocks.repository.listRosterMatrixAssignments.mockResolvedValue([
      { id: "roster_1", employee_id: "emp_1", roster_date: "2026-06-15", status: "draft", shift_template_id: "shift_morning", shift_name: "Morning", shift_code: "M", start_time: "08:00", end_time: "16:00", break_minutes: 60, outlet_id: "outlet_1", department_id: "dept_ops", position_id: "pos_staff", source: "manual", published_at: null, open_conflict_count: 0, blocking_conflict_count: 0 },
      { id: "roster_2", employee_id: "emp_1", roster_date: "2026-06-15", status: "draft", shift_template_id: "shift_evening", shift_name: "Evening", shift_code: "E", start_time: "16:00", end_time: "23:00", break_minutes: 30, outlet_id: "outlet_1", department_id: "dept_ops", position_id: "pos_staff", source: "manual", published_at: null, open_conflict_count: 0, blocking_conflict_count: 0 },
    ]);
    const result = await getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });
    expect(result.employees[0].cells[0].status).toBe("DOUBLE_BOOKED");
    expect(result.summary.double_bookings).toBe(1);
  });

  it("leave conflict detected", async () => {
    mocks.repository.listApprovedLeavesForRosterMatrix.mockResolvedValue([{ id: "leave_1", employee_id: "emp_1", start_date: "2026-06-15", end_date: "2026-06-15", leave_name: "Annual Leave", status: "approved" }]);
    const conflicts = await detectRosterConflicts(env, actor(), { employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning" }, { departmentId: "dept_ops", outletId: "outlet_1" });
    expect(conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EMPLOYEE_ON_LEAVE", severity: "error" })]));
  });

  it("inactive employee assignment blocked", async () => {
    mocks.repository.listRosterMatrixEmployees.mockResolvedValue([{ ...employee, employment_status: "resigned" }]);
    const conflicts = await detectRosterConflicts(env, actor(), { employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning" }, { departmentId: "dept_ops" });
    expect(conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EMPLOYEE_NOT_ACTIVE" })]));
  });

  it("submit creates roster change request when approval required", async () => {
    const result = await submitRosterMatrixChanges(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      outlet_id: "outlet_1",
      reason: "Weekly roster planning.",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", reason: "Cover morning shift." }],
    });
    expect(result.operation_type).toBe("ROSTER_CHANGE");
    expect(mocks.rosterService.createRosterChangeRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      employee_id: "emp_1",
      change_type: "SHIFT_CREATE",
      requested_value_json: expect.objectContaining({ source: "weekly_matrix" }),
    }));
    expect(mocks.rosterService.submitRosterChangeForApproval).toHaveBeenCalledWith(expect.anything(), expect.anything(), "roster_change_1");
  });

  it("user with edit/submit but no override permission cannot use override_conflicts", async () => {
    await expect(submitRosterMatrixChanges(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", override_conflicts: true, reason: "Holiday cover" }],
    })).rejects.toMatchObject({
      message: "You do not have permission to override roster matrix conflict warnings.",
    });
  });

  it("user with override permission can override warning-level conflict and audit it", async () => {
    mocks.repository.listHolidaysForRosterMatrix.mockResolvedValue([{ id: "holiday_1", start_date: "2026-06-15", end_date: "2026-06-15", holiday_name: "Public Holiday" }]);
    const result = await submitRosterMatrixChanges(env, actor({ permissions: [...actor().permissions, "rosters.weeklyMatrix.overrideConflicts"] }), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", override_conflicts: true, reason: "Approved holiday coverage" }],
    });
    expect(result.submitted_count).toBe(1);
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "ROSTER_MATRIX_CONFLICT_OVERRIDE_SUBMITTED",
      employeeId: "emp_1",
    }));
  });

  it("critical conflicts remain blocked even when override permission exists", async () => {
    mocks.repository.listRosterMatrixAssignments.mockResolvedValue([{ id: "roster_1", employee_id: "emp_1", roster_date: "2026-06-15", status: "draft", shift_template_id: "shift_other", shift_name: "Other", shift_code: "O", start_time: "12:00", end_time: "20:00", break_minutes: 60, outlet_id: "outlet_1", department_id: "dept_ops", position_id: "pos_staff", source: "manual", published_at: null, open_conflict_count: 0, blocking_conflict_count: 0 }]);
    await expect(submitRosterMatrixChanges(env, actor({ permissions: [...actor().permissions, "rosters.weeklyMatrix.overrideConflicts"] }), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", override_conflicts: true, reason: "Try override" }],
    })).rejects.toMatchObject({
      message: "Roster matrix changes have blocking conflicts. Resolve critical conflicts before saving or submitting.",
    });
  });

  it("override reason is required", async () => {
    mocks.repository.listHolidaysForRosterMatrix.mockResolvedValue([{ id: "holiday_1", start_date: "2026-06-15", end_date: "2026-06-15", holiday_name: "Public Holiday" }]);
    await expect(submitRosterMatrixChanges(env, actor({ permissions: [...actor().permissions, "rosters.weeklyMatrix.overrideConflicts"] }), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", override_conflicts: true }],
    })).rejects.toMatchObject({
      message: "A reason is required when overriding roster conflict warnings.",
    });
  });

  it("save draft ASSIGN_SHIFT creates draft shift and saved_count matches", async () => {
    const result = await saveRosterMatrixDraft(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      outlet_id: "outlet_1",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", reason: "Draft cover" }],
    });
    expect(result.saved_count).toBe(1);
    expect(mocks.rosterService.createRosterShift).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      employee_id: "emp_1",
      shift_template_id: "shift_morning",
    }));
  });

  it("save draft CHANGE_SHIFT does not silently succeed", async () => {
    await expect(saveRosterMatrixDraft(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "CHANGE_SHIFT", assignment_id: "roster_1", shift_template_id: "shift_morning", reason: "Change" }],
    })).rejects.toMatchObject({
      message: "Only new shift assignments can be saved as draft. Submit changes for approval for shift changes, clear shift, or day off.",
    });
  });

  it("save draft CLEAR_SHIFT does not silently succeed", async () => {
    await expect(saveRosterMatrixDraft(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "CLEAR_SHIFT", assignment_id: "roster_1", reason: "Clear" }],
    })).rejects.toMatchObject({
      message: "Only new shift assignments can be saved as draft. Submit changes for approval for shift changes, clear shift, or day off.",
    });
  });

  it("save draft MARK_DAY_OFF does not silently succeed", async () => {
    await expect(saveRosterMatrixDraft(env, actor(), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "MARK_DAY_OFF", reason: "Day off" }],
    })).rejects.toMatchObject({
      message: "Only new shift assignments can be saved as draft. Submit changes for approval for shift changes, clear shift, or day off.",
    });
  });

  it("bulk assign validates conflicts before staging changes", async () => {
    const result = await bulkAssignRosterMatrix(env, actor({ permissions: [...actor().permissions, "rosters.weeklyMatrix.bulkAssign"] }), {
      week_start: "2026-06-15",
      department_id: "dept_ops",
      changes: [{ employee_id: "emp_1", date: "2026-06-15", action: "ASSIGN_SHIFT", shift_template_id: "shift_morning", reason: "Bulk assign" }],
    });
    expect(result.valid).toBe(true);
    expect(mocks.repository.listRosterMatrixAssignments).toHaveBeenCalled();
  });

  it("Attendance enabled with missing punch returns warning overlay without replacing shift status", async () => {
    mocks.repository.listRosterMatrixAssignments.mockResolvedValue([{ id: "roster_1", employee_id: "emp_1", roster_date: "2026-06-15", status: "draft", shift_template_id: "shift_morning", shift_name: "Morning", shift_code: "M", start_time: "08:00", end_time: "16:00", break_minutes: 60, outlet_id: "outlet_1", department_id: "dept_ops", position_id: "pos_staff", source: "manual", published_at: null, open_conflict_count: 0, blocking_conflict_count: 0 }]);
    mocks.repository.listAttendanceOverlaysForRosterMatrix.mockResolvedValue([{ employee_id: "emp_1", attendance_date: "2026-06-15", status: "missing_clock_out", check_in: "2026-06-15T08:01:00.000Z", check_out: null, late_minutes: 0, worked_minutes: 240, pending_correction_count: 0, approved_correction_count: 0 }]);
    const result = await getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });
    expect(result.employees[0].cells[0].status).toBe("SHIFT_ASSIGNED");
    expect(result.employees[0].cells[0].attendance_overlay).toEqual(expect.objectContaining({ label: "Missing punch", review_required: true }));
  });

  it("Attendance enabled with present record returns attendance overlay", async () => {
    mocks.repository.listAttendanceOverlaysForRosterMatrix.mockResolvedValue([{ employee_id: "emp_1", attendance_date: "2026-06-15", status: "present", check_in: "2026-06-15T08:01:00.000Z", check_out: "2026-06-15T16:00:00.000Z", late_minutes: 0, worked_minutes: 479, pending_correction_count: 0, approved_correction_count: 0 }]);
    const result = await getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });
    expect(result.employees[0].cells[0].attendance_overlay).toEqual(expect.objectContaining({ label: "Attendance present", review_required: false }));
  });

  it("Attendance disabled hides overlay", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "attendance");
    mocks.repository.listAttendanceOverlaysForRosterMatrix.mockResolvedValue([{ employee_id: "emp_1", attendance_date: "2026-06-15", status: "present", check_in: "2026-06-15T08:01:00.000Z", check_out: null, late_minutes: 0, worked_minutes: 120, pending_correction_count: 0, approved_correction_count: 0 }]);
    const result = await getRosterWeeklyMatrix(env, actor(), { department_id: "dept_ops", week_start: "2026-06-15" });
    expect(result.employees[0].cells[0].attendance_overlay).toBeNull();
  });

  it("Roster Weekly Matrix page renders and frontend is wired", () => {
    expect(read("frontend/src/features/roster-matrix/RosterWeeklyMatrixPage.tsx")).toContain("RosterWeeklyMatrix");
    expect(read("frontend/src/features/roster-matrix/RosterCellEditorDrawer.tsx")).toContain("RosterShiftSelect");
    expect(read("frontend/src/features/rosters/RostersPage.tsx")).toContain('value="weekly-matrix"');
    expect(read("frontend/src/features/roster-matrix/RosterBulkAssignDialog.tsx")).toContain("onStageChanges");
    expect(read("frontend/src/features/roster-matrix/RosterBulkAssignDialog.tsx")).toContain("Stage");
    expect(read("frontend/src/features/roster-matrix/RosterCopyWeekDialog.tsx")).toContain("Copy previous week");
  });

  it("disabled roster module hides matrix route/link through module guards", () => {
    expect(read("frontend/src/lib/navigation.ts")).toContain('requiredFeaturesAll: ["roster", "employee_management"]');
    expect(read("frontend/src/app/router.tsx")).toContain('featuresAll: ["roster", "employee_management"]');
  });

  it("no alert/confirm or dark mode introduced", () => {
    const frontend = [
      "frontend/src/features/roster-matrix/RosterWeeklyMatrixPage.tsx",
      "frontend/src/features/roster-matrix/RosterWeeklyMatrix.tsx",
      "frontend/src/features/roster-matrix/RosterDayCell.tsx",
      "frontend/src/features/roster-matrix/RosterCellEditorDrawer.tsx",
    ].map(read).join("\n");
    expect(frontend).not.toMatch(/alert\s*\(/);
    expect(frontend).not.toMatch(/confirm\s*\(/);
    expect(frontend).not.toMatch(/dark:|darkMode|ThemeProvider/);
  });
});
