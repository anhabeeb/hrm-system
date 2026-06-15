import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  repository: {
    findEmployee: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    findRosterShift: vi.fn(),
    findDuplicatePendingRosterChange: vi.fn(),
    createRosterChangeRequest: vi.fn(),
    findRosterChangeById: vi.fn(),
    updateRosterChangeApprovalLink: vi.fn(),
    updateRosterChangeStatus: vi.fn(),
    updateRosterShiftForEmployee: vi.fn(),
    cancelRosterShiftForEmployee: vi.fn(),
    createRosterShift: vi.fn(),
    listRosterChanges: vi.fn(),
    findOverlappingShift: vi.fn(),
    hasApprovedLeaveOnDate: vi.fn(),
    hasContractRecords: vi.fn(),
    hasActiveContractOnDate: vi.fn(),
    getExpectedRosterForEmployeeDate: vi.fn(),
  },
  approvalEngine: {
    createApprovalRequestDraft: vi.fn(),
    submitApprovalRequest: vi.fn(),
    approveStep: vi.fn(),
    rejectStep: vi.fn(),
    cancelRequest: vi.fn(),
    getTimeline: vi.fn(),
  },
  settings: { getSetting: vi.fn() },
  holidays: { getHolidaySettings: vi.fn() },
  holidayCalculation: { getHolidaysForRange: vi.fn() },
  payrollLock: { assertPayrollMonthUnlocked: vi.fn(), getPayrollMonthFromDate: vi.fn() },
  audit: { createAuditLog: vi.fn() },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasOutletAccess: vi.fn(),
  },
}));

vi.mock("../src/modules/rosters/rosters.repository", () => mocks.repository);
vi.mock("../src/modules/approvals/approval-workflow-engine.service", () => mocks.approvalEngine);
vi.mock("../src/services/settings.service", () => mocks.settings);
vi.mock("../src/modules/holidays/holidays.service", () => mocks.holidays);
vi.mock("../src/modules/holidays/holiday-calculation.service", () => mocks.holidayCalculation);
vi.mock("../src/modules/payroll/payroll-lock.service", () => mocks.payrollLock);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permissions);

import * as rosterService from "../src/modules/rosters/rosters.service";
import { validateRosterChangeRequestInput } from "../src/modules/rosters/rosters.validators";
import type { AuthActor } from "../src/types/api.types";
import { PermissionError } from "../src/utils/errors";

const env = {} as Env;
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_employee",
  fullName: "Employee",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: ["roster.changes.create", "roster.changes.cancel"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const employee = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP001",
  full_name: "Aisha Employee",
  employment_status: "active",
  primary_outlet_id: "outlet_1",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  deleted_at: null,
};

const otherEmployee = {
  ...employee,
  id: "emp_2",
  employee_code: "EMP002",
  full_name: "Other Employee",
  department_id: "dept_ops",
};

const shift = {
  id: "roster_shift_1",
  company_id: "company_1",
  outlet_id: "outlet_1",
  department_id: "dept_ops",
  position_id: "pos_staff",
  employee_id: "emp_1",
  roster_date: "2026-06-18",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 60,
  status: "published",
  source: "manual",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const changeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "roster_change_1",
  company_id: "company_1",
  employee_id: "emp_1",
  requester_employee_id: "emp_1",
  requester_user_id: "user_employee",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  outlet_id: "outlet_1",
  store_id: "outlet_1",
  roster_id: null,
  shift_id: "roster_shift_1",
  source_roster_id: null,
  target_roster_id: null,
  source_shift_id: null,
  target_shift_id: null,
  change_type: "SHIFT_TIME_CHANGE",
  requested_date: "2026-06-18",
  requested_start_at: "10:00",
  requested_end_at: "18:00",
  requested_break_start: null,
  requested_break_end: null,
  current_value_json: JSON.stringify(shift),
  requested_value_json: JSON.stringify({ start_time: "10:00", end_time: "18:00", break_minutes: 45, override_warnings: true }),
  reason: "Shift moved",
  employee_note: null,
  manager_note: null,
  status: "DRAFT",
  approval_request_id: null,
  approval_status: null,
  approval_current_step: null,
  current_step_name: null,
  approval_submitted_at: null,
  approval_completed_at: null,
  applied_at: null,
  applied_by: null,
  apply_error_code: null,
  apply_error_message: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  cancelled_at: null,
  cancelled_by: null,
  archived_at: null,
  created_at: "2026-06-10T00:00:00Z",
  updated_at: "2026-06-10T00:00:00Z",
  ...overrides,
});

let currentChange: ReturnType<typeof changeRecord>;

beforeEach(() => {
  vi.clearAllMocks();
  currentChange = changeRecord();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.isSuperAdmin || context.permissions.includes(permission));
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.permissions.hasOutletAccess.mockImplementation((context: AuthActor, outletId?: string | null) => !outletId || context.isSuperAdmin || context.outletIds.includes(outletId));
  mocks.repository.findEmployeeByUserId.mockResolvedValue(employee);
  mocks.repository.findEmployee.mockImplementation(async (_env, _companyId, id) => id === "emp_2" ? otherEmployee : employee);
  mocks.repository.findRosterShift.mockResolvedValue(shift);
  mocks.repository.findDuplicatePendingRosterChange.mockResolvedValue(null);
  mocks.repository.createRosterChangeRequest.mockResolvedValue({ success: true });
  mocks.repository.findRosterChangeById.mockImplementation(async () => currentChange);
  mocks.repository.updateRosterChangeApprovalLink.mockResolvedValue({ success: true });
  mocks.repository.updateRosterChangeStatus.mockResolvedValue({ success: true });
  mocks.repository.updateRosterShiftForEmployee.mockResolvedValue({ success: true });
  mocks.repository.cancelRosterShiftForEmployee.mockResolvedValue({ success: true });
  mocks.repository.createRosterShift.mockResolvedValue({ success: true });
  mocks.repository.listRosterChanges.mockResolvedValue({ rows: [currentChange], total: 1 });
  mocks.repository.findOverlappingShift.mockResolvedValue(null);
  mocks.repository.hasApprovedLeaveOnDate.mockResolvedValue(null);
  mocks.repository.hasContractRecords.mockResolvedValue(null);
  mocks.repository.hasActiveContractOnDate.mockResolvedValue(null);
  mocks.settings.getSetting.mockResolvedValue({ setting_value_json: JSON.stringify({ allow_roster_overlap_override: false, allow_scheduling_on_leave: false, allow_scheduling_on_holidays: true }) });
  mocks.holidays.getHolidaySettings.mockResolvedValue({ holiday_module_enabled: 0, holiday_roster_rules_enabled: 0 });
  mocks.holidayCalculation.getHolidaysForRange.mockResolvedValue([]);
  mocks.payrollLock.assertPayrollMonthUnlocked.mockResolvedValue(undefined);
  mocks.payrollLock.getPayrollMonthFromDate.mockReturnValue("2026-06");
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
  mocks.approvalEngine.createApprovalRequestDraft.mockResolvedValue({ id: "approval_req_1", status: "DRAFT" });
  mocks.approvalEngine.submitApprovalRequest.mockResolvedValue({ id: "approval_req_1", status: "IN_REVIEW", current_step_id: "approval_step_department", current_step_name: "Department Approval" });
  mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });
  mocks.approvalEngine.rejectStep.mockResolvedValue({ id: "approval_req_1", status: "REJECTED", current_step_id: null });
  mocks.approvalEngine.cancelRequest.mockResolvedValue({ id: "approval_req_1", status: "CANCELLED", current_step_id: null });
  mocks.approvalEngine.getTimeline.mockResolvedValue({ request: { id: "approval_req_1" }, steps: [{ id: "step_1", step_name: "Department Approval", status: "SKIPPED", fallback_applied: "SKIP_TO_HR" }], actions: [] });
});

describe("roster change approval integration", () => {
  it("creates a ROSTER_CHANGE approval request for an employee's own roster change", async () => {
    await rosterService.createRosterChangeRequest(env, actor(), {
      employee_id: "emp_1",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      requested_value_json: { break_minutes: 45 },
      reason: "Shift moved",
      override_warnings: true,
    });
    const result = await rosterService.submitRosterChangeForApproval(env, actor(), "roster_change_1");

    expect(result.already_submitted).toBe(false);
    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "ROSTER_CHANGE",
      subject_type: "ROSTER_CHANGE",
      subject_employee_id: "emp_1",
      department_id: "dept_ops",
      position_id: "pos_staff",
      level: 1,
    }), {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "roster.changes.createForOthers",
      moduleOperationType: "ROSTER_CHANGE",
    });
  });

  it("blocks a normal employee from creating a roster change for another employee", async () => {
    await expect(rosterService.createRosterChangeRequest(env, actor(), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Shift moved",
    })).rejects.toThrow("another employee");
    expect(mocks.repository.createRosterChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects roster shift ownership mismatch before creating approval request", async () => {
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });

    await expect(rosterService.createRosterChangeRequest(env, actor(), {
      employee_id: "emp_1",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Wrong shift",
    })).rejects.toThrow("does not belong");
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("allows HR with roster.changes.createForOthers to create and submit for another employee", async () => {
    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_1" });
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });
    await rosterService.createRosterChangeRequest(env, actor({ permissions: ["roster.changes.createForOthers"], isAdmin: true }), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "HR adjustment",
    });
    await rosterService.submitRosterChangeForApproval(env, actor({ permissions: ["roster.changes.createForOthers"], isAdmin: true }), "roster_change_1");

    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "ROSTER_CHANGE",
      subject_employee_id: "emp_2",
      department_id: "dept_ops",
      position_id: "pos_staff",
    }), expect.objectContaining({ modulePermission: "roster.changes.createForOthers" }));
  });

  it("allows a department manager to create for a lower-level same-department employee", async () => {
    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_manager" });
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, id: "emp_manager", level: 4, department_id: "dept_ops" });
    mocks.repository.findEmployee.mockResolvedValue({ ...otherEmployee, level: 1, department_id: "dept_ops" });
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });

    await rosterService.createRosterChangeRequest(env, actor({
      actorUserId: "user_manager",
      roleKeys: ["supervisor"],
      permissions: ["roster.changes.createForOthers"],
    }), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Manager adjustment",
    });

    expect(mocks.repository.createRosterChangeRequest).toHaveBeenCalled();
  });

  it("blocks a department manager from creating for another department", async () => {
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, id: "emp_manager", level: 4, department_id: "dept_ops" });
    mocks.repository.findEmployee.mockResolvedValue({ ...otherEmployee, level: 1, department_id: "dept_finance" });
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });

    await expect(rosterService.createRosterChangeRequest(env, actor({
      actorUserId: "user_manager",
      roleKeys: ["supervisor"],
      permissions: ["roster.changes.createForOthers"],
    }), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Manager adjustment",
    })).rejects.toThrow("own department");
  });

  it("blocks a department manager from creating for a same or higher-level employee", async () => {
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, id: "emp_manager", level: 3, department_id: "dept_ops" });
    mocks.repository.findEmployee.mockResolvedValue({ ...otherEmployee, level: 3, department_id: "dept_ops" });
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });

    await expect(rosterService.createRosterChangeRequest(env, actor({
      actorUserId: "user_manager",
      roleKeys: ["supervisor"],
      permissions: ["roster.changes.createForOthers"],
    }), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Manager adjustment",
    })).rejects.toThrow("lower-level");
  });

  it("allows Super Admin to create across departments", async () => {
    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_super" });
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, id: "emp_super", level: 1, department_id: "dept_ops" });
    mocks.repository.findEmployee.mockResolvedValue({ ...otherEmployee, level: 4, department_id: "dept_finance" });
    mocks.repository.findRosterShift.mockResolvedValue({ ...shift, employee_id: "emp_2" });

    await rosterService.createRosterChangeRequest(env, actor({
      actorUserId: "user_super",
      isSuperAdmin: true,
      roleKeys: ["super_admin"],
      permissions: [],
    }), {
      employee_id: "emp_2",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      reason: "Super admin adjustment",
    });

    expect(mocks.repository.createRosterChangeRequest).toHaveBeenCalled();
  });

  it("does not create duplicate approval requests on repeated submit", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_existing", approval_status: "IN_REVIEW", status: "PENDING_DEPARTMENT_APPROVAL" });
    const result = await rosterService.submitRosterChangeForApproval(env, actor(), "roster_change_1");

    expect(result.already_submitted).toBe(true);
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("uses an employee-safe roster shift update and applies only after final approval", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_1", status: "PENDING_HR_APPROVAL" });
    await rosterService.approveRosterChangeStep(env, actor({ permissions: ["approvals.hrFinal.approve"] }), "roster_change_1", { reason: "Approved" });

    expect(mocks.repository.updateRosterShiftForEmployee).toHaveBeenCalledWith(expect.anything(), "company_1", "roster_shift_1", "emp_1", expect.objectContaining({
      roster_date: "2026-06-18",
      start_time: "10:00",
      end_time: "18:00",
    }), "user_employee");
    expect(mocks.repository.updateRosterChangeStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "roster_change_1", expect.objectContaining({ status: "APPLIED" }));
  });

  it("marks roster change FAILED_TO_APPLY and audits if final apply fails", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_1", status: "PENDING_HR_APPROVAL" });
    mocks.repository.updateRosterShiftForEmployee.mockRejectedValue(new Error("Roster period is locked"));

    await rosterService.approveRosterChangeStep(env, actor({ permissions: ["approvals.hrFinal.approve"] }), "roster_change_1", { reason: "Approved" });

    expect(mocks.repository.updateRosterChangeStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "roster_change_1", expect.objectContaining({
      status: "FAILED_TO_APPLY",
      apply_error_message: "Roster period is locked",
    }));
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "roster_change_apply_failed" }));
  });

  it("builds row-level visibility so normal employees do not list same-outlet coworkers", async () => {
    await rosterService.listRosterChangeRequests(env, actor(), { page: 1, page_size: 25 });

    expect(mocks.repository.listRosterChanges).toHaveBeenCalledWith(expect.anything(), "company_1", expect.anything(), expect.stringContaining("rc.employee_id = ?"), expect.arrayContaining(["emp_1"]));
  });

  it("allows HR final approver to view HR-final roster change timeline only when approval visibility allows it", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_1", status: "PENDING_HR_APPROVAL", approval_status: "IN_REVIEW" });
    await rosterService.getRosterChangeApprovalTimeline(env, actor({
      actorUserId: "user_hr_final",
      permissions: ["approvals.hrFinal.view"],
    }), "roster_change_1");

    expect(mocks.approvalEngine.getTimeline).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorUserId: "user_hr_final" }), "approval_req_1");
  });

  it("blocks HR final approver from unrelated non-HR-final roster change detail", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_1", status: "PENDING_DEPARTMENT_APPROVAL", employee_id: "emp_2", requester_employee_id: "emp_2", department_id: "dept_other" });
    mocks.approvalEngine.getTimeline.mockRejectedValue(new PermissionError("No timeline access."));

    await expect(rosterService.getRosterChangeRequest(env, actor({
      actorUserId: "user_hr_final",
      permissions: ["approvals.hrFinal.view"],
    }), "roster_change_1")).rejects.toThrow("access");
  });

  it("blocks normal employee from viewing coworker roster change detail", async () => {
    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_2", requester_user_id: "user_other", approval_request_id: null });

    await expect(rosterService.getRosterChangeRequest(env, actor(), "roster_change_1")).rejects.toThrow("access");
  });

  it("allows department approver to view same-department detail and blocks unrelated departments", async () => {
    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_2", requester_user_id: "user_other", department_id: "dept_ops", approval_request_id: null });
    await rosterService.getRosterChangeRequest(env, actor({ permissions: ["approvals.department.view"] }), "roster_change_1");

    currentChange = changeRecord({ employee_id: "emp_2", requester_employee_id: "emp_2", requester_user_id: "user_other", department_id: "dept_other", approval_request_id: null });
    await expect(rosterService.getRosterChangeRequest(env, actor({ permissions: ["approvals.department.view"] }), "roster_change_1")).rejects.toThrow("access");
  });

  it("cancels the linked approval request with roster module-bound permissions", async () => {
    currentChange = changeRecord({ approval_request_id: "approval_req_1", status: "PENDING_DEPARTMENT_APPROVAL" });
    await rosterService.cancelRosterChangeRequest(env, actor(), "roster_change_1", { reason: "No longer needed" });

    expect(mocks.approvalEngine.cancelRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "roster.changes.cancel",
      moduleCancelAnyPermission: "roster.changes.cancelAny",
      moduleOperationType: "ROSTER_CHANGE",
    });
    expect(mocks.repository.updateRosterChangeStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "roster_change_1", expect.objectContaining({ status: "CANCELLED" }));
  });

  it("rejects sensitive roster change payload keys before service submission", () => {
    expect.assertions(2);
    try {
      validateRosterChangeRequestInput({
      employee_id: "emp_1",
      shift_id: "roster_shift_1",
      change_type: "SHIFT_TIME_CHANGE",
      requested_date: "2026-06-18",
      requested_start_at: "10:00",
      requested_end_at: "18:00",
      requested_value_json: { reset_token: "unsafe" },
      reason: "Unsafe payload",
      });
    } catch (error) {
      expect((error as Error).message).toContain("Please review the roster change request");
      expect(JSON.stringify((error as { fieldErrors?: Record<string, string> }).fieldErrors)).toContain("Sensitive fields");
    }
  });

  it("frontend generic approvals page uses roster-specific action paths", () => {
    const page = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(page).toContain('operation_type === "ROSTER_CHANGE"');
    expect(page).toContain("rostersApi.approveChange");
    expect(page).toContain("rostersApi.rejectChange");
    expect(page).toContain("rostersApi.cancelChange");
  });

  it("frontend create/submit flow uses rostersApi.createChange and rostersApi.submitChange", () => {
    const dialog = read("frontend/src/features/rosters/RosterChangeRequestDialog.tsx");
    expect(dialog).toContain("rostersApi.createChange");
    expect(dialog).toContain("rostersApi.submitChange");
    expect(dialog).toContain("Your roster change request has been submitted for approval.");
    expect(dialog).toContain("currentEmployeeId");
  });

  it("frontend roster page permission-gates roster change actions", () => {
    const page = read("frontend/src/features/rosters/RostersPage.tsx");
    expect(page).toContain("canApproveChange");
    expect(page).toContain("canRejectChange");
    expect(page).toContain("canCancelChange");
    expect(page).toContain("roster.changes.cancelAny");
    expect(page).toContain("auth.user?.employee_id");
  });
});
