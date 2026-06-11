import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findEmployeeForAttendance: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    findDuplicatePendingCorrection: vi.fn(),
    createCorrection: vi.fn(),
    updateCorrectionApprovalLink: vi.fn(),
    updateCorrectionApprovalStatus: vi.fn(),
    findCorrectionById: vi.fn(),
    findEventById: vi.fn(),
    findEmployeeOutlet: vi.fn(),
    findSummaryOutlet: vi.fn(),
    findPayrollRunForMonth: vi.fn(),
    upsertDailySummary: vi.fn(),
    updateAttendanceEvent: vi.fn(),
    updateCorrectionStatus: vi.fn(),
    countCorrections: vi.fn(),
    listCorrections: vi.fn(),
  },
  summary: {
    rebuildDailySummary: vi.fn(),
  },
  approvalEngine: {
    createApprovalRequestDraft: vi.fn(),
    submitApprovalRequest: vi.fn(),
    approveStep: vi.fn(),
    rejectStep: vi.fn(),
    cancelRequest: vi.fn(),
    getTimeline: vi.fn(),
  },
  audit: { createAuditLog: vi.fn() },
  realtime: { broadcastEvent: vi.fn() },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasOutletAccess: vi.fn(),
  },
}));

vi.mock("../src/modules/attendance/attendance.repository", () => mocks.repository);
vi.mock("../src/modules/attendance/attendance-summary.service", () => mocks.summary);
vi.mock("../src/modules/approvals/approval-workflow-engine.service", () => mocks.approvalEngine);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/realtime.service", () => mocks.realtime);
vi.mock("../src/services/permission.service", () => mocks.permissions);

import * as attendanceService from "../src/modules/attendance/attendance.service";
import type { AuthActor } from "../src/types/api.types";

const env = {} as Env;

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_employee",
  fullName: "Employee",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: ["attendance.corrections.create", "attendance.corrections.cancel"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const employee = {
  id: "emp_1",
  employee_code: "EMP001",
  full_name: "Aisha Employee",
  primary_outlet_id: "outlet_1",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  employment_status: "active",
  archived_at: null,
  deleted_at: null,
};

const otherEmployee = {
  ...employee,
  id: "emp_2",
  employee_code: "EMP002",
  full_name: "Other Employee",
};

const correction = (overrides: Record<string, unknown> = {}) => ({
  id: "att_corr_1",
  company_id: "company_1",
  employee_id: "emp_1",
  attendance_event_id: null,
  correction_type: "status",
  old_value_json: null,
  new_value_json: JSON.stringify({ attendance_date: "2026-06-10", outlet_id: "outlet_1", status: "present" }),
  reason: "Forgot punch",
  requested_by: "user_employee",
  status: "PENDING_HR_APPROVAL",
  approval_request_id: "approval_req_1",
  approval_status: "IN_REVIEW",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.permissions.includes(permission) || context.isSuperAdmin);
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.permissions.hasOutletAccess.mockImplementation((context: AuthActor, outletId?: string | null) => !outletId || context.isSuperAdmin || context.outletIds.includes(outletId));
  mocks.repository.findEmployeeByUserId.mockResolvedValue(employee);
  mocks.repository.findEmployeeForAttendance.mockResolvedValue(employee);
  mocks.repository.findEmployeeOutlet.mockResolvedValue({ primary_outlet_id: "outlet_1" });
  mocks.repository.findSummaryOutlet.mockResolvedValue({ outlet_id: "outlet_1" });
  mocks.repository.findDuplicatePendingCorrection.mockResolvedValue(null);
  mocks.repository.createCorrection.mockResolvedValue({ success: true });
  mocks.repository.updateCorrectionApprovalLink.mockResolvedValue({ success: true });
  mocks.repository.updateCorrectionApprovalStatus.mockResolvedValue({ success: true });
  mocks.repository.findPayrollRunForMonth.mockResolvedValue(null);
  mocks.repository.upsertDailySummary.mockResolvedValue({ success: true });
  mocks.repository.updateAttendanceEvent.mockResolvedValue({ success: true });
  mocks.repository.countCorrections.mockResolvedValue(0);
  mocks.repository.listCorrections.mockResolvedValue([]);
  mocks.summary.rebuildDailySummary.mockResolvedValue({ attendance_date: "2026-06-10", status: "present", classification: "present" });
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
  mocks.realtime.broadcastEvent.mockResolvedValue(undefined);
  mocks.approvalEngine.createApprovalRequestDraft.mockResolvedValue({ id: "approval_req_1", status: "DRAFT" });
  mocks.approvalEngine.submitApprovalRequest.mockResolvedValue({ id: "approval_req_1", status: "IN_REVIEW", current_step_id: "approval_step_hr" });
  mocks.approvalEngine.getTimeline.mockResolvedValue({
    request: { id: "approval_req_1", status: "IN_REVIEW", current_step_id: "approval_step_hr" },
    steps: [{ id: "approval_step_hr", step_name: "HR Final Approval", status: "PENDING", approver_resolver_type: "HR_FINAL_APPROVER" }],
    actions: [],
  });
});

describe("attendance correction approval integration", () => {
  it("creates an ATTENDANCE_CORRECTION approval request for an employee's own correction", async () => {
    const result = await attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_1",
      attendance_date: "2026-06-10",
      correction_type: "status",
      requested_status: "present",
      reason: "Forgot punch",
    });

    expect(result.approval_request_id).toBe("approval_req_1");
    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "ATTENDANCE_CORRECTION",
      subject_type: "ATTENDANCE_CORRECTION",
      subject_employee_id: "emp_1",
      department_id: "dept_ops",
      position_id: "pos_staff",
      level: 1,
    }), {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "attendance.corrections.createForOthers",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    });
  });

  it("blocks a normal employee from creating a correction for another employee", async () => {
    mocks.repository.findEmployeeByUserId.mockResolvedValue(employee);
    await expect(attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_2",
      attendance_date: "2026-06-10",
      correction_type: "status",
      requested_status: "present",
      reason: "Forgot punch",
    })).rejects.toThrow("another employee");
  });

  it("rejects attendance_event_id when it belongs to another employee", async () => {
    mocks.repository.findEventById.mockResolvedValue({
      id: "att_other",
      company_id: "company_1",
      employee_id: "emp_2",
      outlet_id: "outlet_1",
      event_type: "clock_in",
      event_time: "2026-06-10T08:00:00+05:00",
    });

    await expect(attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_1",
      attendance_event_id: "att_other",
      attendance_date: "2026-06-10",
      correction_type: "clock_in_time",
      requested_clock_in: "09:00",
      reason: "Wrong time",
    })).rejects.toThrow("does not belong to this employee");
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("rejects sensitive payload keys and unsupported correction types before approval creation", async () => {
    await expect(attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_1",
      attendance_date: "2026-06-10",
      correction_type: "status",
      new_value_json: { attendance_date: "2026-06-10", outlet_id: "outlet_1", status: "present", reset_token: "unsafe" },
      reason: "Unsafe payload",
    })).rejects.toThrow("Sensitive field");

    await expect(attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_1",
      attendance_date: "2026-06-10",
      correction_type: "unsupported",
      new_value_json: { attendance_date: "2026-06-10" },
      reason: "Unsupported",
    })).rejects.toThrow("not supported");
  });

  it("rejects invalid requested time before approval creation", async () => {
    await expect(attendanceService.createCorrectionRequest(env, actor(), {
      employee_id: "emp_1",
      attendance_date: "2026-06-10",
      correction_type: "clock_in_time",
      requested_clock_in: "not-a-time",
      reason: "Invalid time",
    })).rejects.toThrow("valid attendance time");
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("lets HR/Admin with attendance.corrections.createForOthers create on behalf through module-bound approval creation", async () => {
    mocks.repository.findEmployeeForAttendance.mockResolvedValue(otherEmployee);
    const hr = actor({
      actorUserId: "user_hr",
      permissions: ["attendance.corrections.create", "attendance.corrections.createForOthers"],
      isAdmin: true,
    });

    await attendanceService.createCorrectionRequest(env, hr, {
      employee_id: "emp_2",
      attendance_date: "2026-06-10",
      correction_type: "status",
      requested_status: "present",
      reason: "Manager correction",
    });

    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "ATTENDANCE_CORRECTION",
      subject_employee_id: "emp_2",
      department_id: "dept_ops",
      position_id: "pos_staff",
      level: 1,
    }), expect.objectContaining({ modulePermission: "attendance.corrections.createForOthers" }));
  });

  it("does not apply the attendance change after department approval", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction({ status: "PENDING_DEPARTMENT_APPROVAL" }));
    mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "IN_REVIEW", current_step_id: "approval_step_hr" });

    const result = await attendanceService.approveCorrection(env, actor({ permissions: ["approvals.department.approve"] }), "att_corr_1", { reason: "Looks valid" });

    expect(result).toMatchObject({ approved: false, pending_final_approval: true });
    expect(mocks.repository.upsertDailySummary).not.toHaveBeenCalled();
  });

  it("applies the attendance correction only after HR final approval", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction());
    mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });

    await attendanceService.approveCorrection(env, actor({ actorUserId: "user_hr", permissions: ["approvals.hrFinal.approve"] }), "att_corr_1", { reason: "Final approval" });

    expect(mocks.repository.upsertDailySummary).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      company_id: "company_1",
      employee_id: "emp_1",
      outlet_id: "outlet_1",
      attendance_date: "2026-06-10",
      status: "present",
    }));
    expect(mocks.repository.updateCorrectionApprovalStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "att_corr_1", expect.objectContaining({
      status: "approved",
      approvalStatus: "APPROVED",
      hrApproved: true,
      applied: true,
    }));
  });

  it("uses an employee-safe event update and rechecks event ownership during final apply", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction({
      correction_type: "clock_in_time",
      attendance_event_id: "att_1",
      new_value_json: JSON.stringify({ attendance_date: "2026-06-10", time: "09:00", outlet_id: "outlet_1" }),
    }));
    mocks.repository.findEventById.mockResolvedValue({
      id: "att_1",
      company_id: "company_1",
      employee_id: "emp_1",
      outlet_id: "outlet_1",
      event_type: "clock_in",
      event_time: "2026-06-10T08:00:00+05:00",
    });
    mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });

    await attendanceService.approveCorrection(env, actor({ actorUserId: "user_hr", permissions: ["approvals.hrFinal.approve"] }), "att_corr_1", { reason: "Final approval" });

    expect(mocks.repository.findEventById).toHaveBeenCalledWith(expect.anything(), "company_1", "att_1");
    expect(mocks.repository.updateAttendanceEvent).toHaveBeenCalledWith(expect.anything(), "company_1", "emp_1", "att_1", "clock_in", "2026-06-10T09:00:00+05:00");
  });

  it("marks correction FAILED_TO_APPLY and audits if final apply fails after approval", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction({
      correction_type: "clock_in_time",
      attendance_event_id: "att_1",
      new_value_json: JSON.stringify({ attendance_date: "2026-06-10", time: "09:00", outlet_id: "outlet_1" }),
    }));
    mocks.repository.findEventById.mockResolvedValue({
      id: "att_1",
      company_id: "company_1",
      employee_id: "emp_1",
      outlet_id: "outlet_1",
      event_type: "clock_in",
      event_time: "2026-06-10T08:00:00+05:00",
    });
    mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });
    mocks.repository.updateAttendanceEvent.mockRejectedValue(new Error("stale lock"));

    await expect(attendanceService.approveCorrection(env, actor({ actorUserId: "user_hr", permissions: ["approvals.hrFinal.approve"] }), "att_corr_1", { reason: "Final approval" })).rejects.toThrow("stale lock");

    expect(mocks.repository.updateCorrectionApprovalStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "att_corr_1", expect.objectContaining({
      status: "FAILED_TO_APPLY",
      approvalStatus: "APPROVED",
    }));
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "attendance_correction_apply_failed",
    }));
  });

  it("cancels the linked approval request without modifying attendance", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction({ status: "PENDING_HR_APPROVAL" }));
    mocks.approvalEngine.cancelRequest.mockResolvedValue({ id: "approval_req_1", status: "CANCELLED" });

    await attendanceService.cancelCorrection(env, actor(), "att_corr_1", { reason: "No longer needed" });

    expect(mocks.approvalEngine.cancelRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "attendance.corrections.cancel",
      moduleCancelAnyPermission: "attendance.corrections.cancelAny",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    });
    expect(mocks.repository.upsertDailySummary).not.toHaveBeenCalled();
  });

  it("blocks normal users from cancelling another employee correction but allows cancelAny", async () => {
    mocks.repository.findCorrectionById.mockResolvedValue(correction({ employee_id: "emp_2", requested_by: "user_other" }));
    await expect(attendanceService.cancelCorrection(env, actor(), "att_corr_1", { reason: "No" })).rejects.toThrow("cannot cancel");

    await attendanceService.cancelCorrection(env, actor({ actorUserId: "user_hr", permissions: ["attendance.corrections.cancelAny"] }), "att_corr_1", { reason: "Admin cancel" });
    expect(mocks.approvalEngine.cancelRequest).toHaveBeenCalled();
  });

  it("builds row-level visibility so normal employees do not list same-outlet coworkers", async () => {
    await attendanceService.listCorrections(env, actor(), { page: 1, page_size: 25 });

    expect(mocks.repository.listCorrections).toHaveBeenCalledWith(expect.anything(), "company_1", expect.anything(), expect.anything(), expect.stringContaining("c.employee_id = ?"), expect.arrayContaining(["emp_1"]));
  });

  it("adds department and HR approval visibility for eligible approvers", async () => {
    await attendanceService.listCorrections(env, actor({ actorUserId: "user_dept", permissions: ["approvals.department.view"], roleKeys: ["supervisor"] }), { page: 1, page_size: 25 });
    expect(mocks.repository.listCorrections).toHaveBeenLastCalledWith(expect.anything(), "company_1", expect.anything(), expect.anything(), expect.stringContaining("DEPARTMENT_LEVEL"), expect.arrayContaining(["dept_ops"]));

    await attendanceService.listCorrections(env, actor({ actorUserId: "user_hr", permissions: ["approvals.hrFinal.view"], roleKeys: ["hr"] }), { page: 1, page_size: 25 });
    expect(mocks.repository.listCorrections).toHaveBeenLastCalledWith(expect.anything(), "company_1", expect.anything(), expect.anything(), expect.stringContaining("HR_FINAL_APPROVER"), expect.any(Array));
  });
});
