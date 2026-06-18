import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findSelfProfile: vi.fn(),
    listSelfRoleNames: vi.fn(),
    listEnabledFeatureKeys: vi.fn(),
    findSelfApprovalRequest: vi.fn(),
    listSelfApprovalRequestSteps: vi.fn(),
    listSelfApprovalActions: vi.fn(),
    findSelfLeaveRequestForApproval: vi.fn(),
  },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
  },
  attendanceCalendar: {
    getSelfAttendanceCalendar: vi.fn(),
  },
  settings: {
    getAttendanceSettings: vi.fn(),
    isPayrollSubFeatureEnabled: vi.fn(),
  },
}));

vi.mock("../src/modules/self-service/self-service.repository", () => mocks.repository);
vi.mock("../src/services/permission.service", () => mocks.permissions);
vi.mock("../src/modules/attendance/attendance-calendar.service", () => mocks.attendanceCalendar);
vi.mock("../src/services/settings.service", () => mocks.settings);

import * as service from "../src/modules/self-service/self-service.service";
import type { AuthActor } from "../src/types/api.types";

const env = {} as Env;

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_employee",
  fullName: "Employee User",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: ["self.profile.view", "self.requests.view"],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: false,
  requestId: "req_test",
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const profileRow = () => ({
  user_id: "user_employee",
  username: "employee",
  user_email: "employee@example.test",
  user_full_name: "Employee User",
  user_status: "active",
  employee_id: "emp_1",
  employee_code: "EMP-001",
  employee_name: "Employee One",
  employment_status: "active",
  department_id: "dept_1",
  department_name: "Operations",
  position_id: "pos_1",
  position_title: "Barista",
  level: 2,
});

const approvalRequest = (overrides: Record<string, unknown> = {}) => ({
  id: "approval_req_1",
  operation_type: "LEAVE_REQUEST",
  subject_type: "leave_request",
  subject_id: "leave_req_1",
  entity_id: "leave_req_1",
  requester_user_id: "user_employee",
  requester_employee_id: "emp_1",
  subject_employee_id: "emp_1",
  employee_id: "emp_1",
  title: "Sick Leave",
  summary: "Sick leave request",
  status: "IN_REVIEW",
  current_step_id: "step_2",
  ...overrides,
});

const step = (overrides: Record<string, unknown> = {}) => ({
  id: "step_1",
  step_order: 1,
  step_code: "HR",
  step_name: "HR Manager",
  approver_resolver_type: "HR_FINAL_APPROVER",
  status: "PENDING",
  required_min_level: null,
  required_max_level: null,
  required_permission: null,
  required_role_name: null,
  assigned_department_name: null,
  approved_at: null,
  rejected_at: null,
  ...overrides,
});

const leaveRequest = (overrides: Record<string, unknown> = {}) => ({
  id: "leave_req_1",
  leave_type_name: "Sick Leave",
  start_date: "2026-06-18",
  end_date: "2026-06-20",
  document_required: 1,
  document_status: "missing",
  document_required_reason: "Documents are required because this request exceeds 2 consecutive day(s).",
  affects_payroll: 1,
  policy_snapshot_json: JSON.stringify({
    document_required: true,
    salary_deduction_required: true,
    deduction_mode: "selected_allowance",
    deduction_source_label: "Attendance Allowance",
    paid_percentage: 100,
    approval_required: true,
    approval_workflow_key: "sick_leave_policy",
  }),
  ...overrides,
});

describe("self-service approval chain", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permissions.isSuperAdmin.mockReturnValue(false);
    mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) =>
      context.permissions.includes(permission),
    );
    mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) =>
      permissions.some((permission) => context.permissions.includes(permission)),
    );
    mocks.repository.findSelfProfile.mockResolvedValue(profileRow());
    mocks.repository.listSelfRoleNames.mockResolvedValue([{ role_name: "Employee" }]);
    mocks.repository.listEnabledFeatureKeys.mockResolvedValue(["leave_management", "approvals"]);
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest());
    mocks.repository.listSelfApprovalActions.mockResolvedValue([]);
    mocks.repository.findSelfLeaveRequestForApproval.mockResolvedValue(leaveRequest());
  });

  it("Employee can see own leave approval chain and cannot use this endpoint as an admin timeline bypass", async () => {
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_code: "HR", step_name: "HR Manager", status: "PENDING" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(mocks.repository.findSelfApprovalRequest).toHaveBeenCalledWith(env, "company_1", "approval_req_1", "user_employee", "emp_1");
    expect(result.approval_chain).toHaveLength(1);
    expect(result.approval_chain[0].step_label).toBe("HR Manager");
  });

  it("Employee cannot see another employee's approval chain", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(null);

    await expect(service.getSelfApprovalChain(env, actor(), "approval_req_other")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("HR-only workflow shows only HR step and Finance does not appear when not configured", async () => {
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_code: "HR", step_name: "HR Manager", approver_resolver_type: "HR_FINAL_APPROVER" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain.map((item) => item.step_label)).toEqual(["HR Manager"]);
    expect(result.approval_chain.some((item) => /finance/i.test(item.step_label))).toBe(false);
  });

  it("Department Senior to Manager to Director to HR Senior to HR Manager workflow shows all configured steps", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest({ current_step_id: "step_3" }));
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_code: "DEPT_SENIOR", step_name: "Department Senior", approver_resolver_type: "DEPARTMENT_LEVEL", status: "APPROVED", required_min_level: 3, required_max_level: 4 }),
      step({ id: "step_2", step_order: 2, step_code: "MANAGER", step_name: "Manager", approver_resolver_type: "REQUESTER_MANAGER", status: "APPROVED" }),
      step({ id: "step_3", step_order: 3, step_code: "DIRECTOR", step_name: "Director", approver_resolver_type: "DEPARTMENT_LEVEL", status: "PENDING", required_min_level: 5 }),
      step({ id: "step_4", step_order: 4, step_code: "HR_SENIOR", step_name: "HR Senior Staff", approver_resolver_type: "HR_FINAL_APPROVER", status: "WAITING_FOR_APPROVER" }),
      step({ id: "step_5", step_order: 5, step_code: "HR_MANAGER", step_name: "HR Manager", approver_resolver_type: "HR_FINAL_APPROVER", status: "WAITING_FOR_APPROVER" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain.map((item) => item.step_label)).toEqual([
      "Department Senior",
      "Manager",
      "Director",
      "HR Senior Staff",
      "HR Manager",
    ]);
    expect(result.approval_chain[2].approver_level_label).toBe("Level 5+ approver");
  });

  it("Finance appears when configured as a real workflow step", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest({ current_step_id: "step_finance" }));
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_manager", step_order: 1, step_code: "MANAGER", step_name: "Manager", approver_resolver_type: "REQUESTER_MANAGER", status: "APPROVED" }),
      step({ id: "step_hr", step_order: 2, step_code: "HR", step_name: "HR", approver_resolver_type: "HR_FINAL_APPROVER", status: "APPROVED" }),
      step({ id: "step_finance", step_order: 3, step_code: "FINANCE", step_name: "Finance Manager", approver_resolver_type: "FINANCE_FINAL_APPROVER", status: "PENDING" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain.map((item) => item.step_label)).toContain("Finance Manager");
    expect(result.approval_chain.find((item) => item.step_key === "FINANCE")?.approver_role_label).toBe("Finance approver");
  });

  it("Current pending step is marked correctly and Approved previous step stays approved", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest({ current_step_id: "step_2" }));
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_name: "Department Senior", status: "APPROVED", approved_at: "2026-06-18T10:00:00Z" }),
      step({ id: "step_2", step_order: 2, step_name: "HR Manager", status: "PENDING" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain[0].status).toBe("approved");
    expect(result.approval_chain[1].status).toBe("pending");
    expect(result.approval_chain[1].is_current_step).toBe(true);
  });

  it("Rejected step is marked rejected and later steps are not_required", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest({ status: "REJECTED", current_step_id: "step_2" }));
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_name: "Manager", status: "APPROVED" }),
      step({ id: "step_2", step_order: 2, step_name: "HR Manager", status: "REJECTED", rejected_at: "2026-06-18T11:00:00Z" }),
      step({ id: "step_3", step_order: 3, step_name: "Director", status: "WAITING_FOR_APPROVER" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain[1].status).toBe("rejected");
    expect(result.approval_chain[2].status).toBe("not_required");
  });

  it("No approval required shows automatic/no-approval status", async () => {
    mocks.repository.findSelfApprovalRequest.mockResolvedValue(approvalRequest({ status: "APPROVED", current_step_id: null }));
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([]);
    mocks.repository.findSelfLeaveRequestForApproval.mockResolvedValue(leaveRequest({
      policy_snapshot_json: JSON.stringify({ approval_required: false, document_required: false }),
      affects_payroll: 0,
    }));

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain).toHaveLength(1);
    expect(result.approval_chain[0].status).toBe("no_approval_required");
  });

  it("Approver names are hidden unless allowed while Role and level labels remain visible", async () => {
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({
        id: "step_1",
        step_order: 1,
        step_name: "Department approver",
        approver_resolver_type: "DEPARTMENT_LEVEL",
        status: "PENDING",
        assigned_approver_name: "Private Manager",
        required_min_level: 3,
        required_max_level: 4,
        required_role_name: "Department Manager",
      }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.approval_chain[0].approver_display_name).toBeNull();
    expect(result.approval_chain[0].approver_role_label).toBe("Department Manager");
    expect(result.approval_chain[0].approver_level_label).toBe("Level 3-4 approver");
  });

  it("Leave policy document-required status and payroll impact appear if available", async () => {
    mocks.repository.listSelfApprovalRequestSteps.mockResolvedValue([
      step({ id: "step_1", step_order: 1, step_name: "HR Manager", status: "PENDING" }),
    ]);

    const result = await service.getSelfApprovalChain(env, actor(), "approval_req_1");

    expect(result.policy_summary?.document_required).toBe(true);
    expect(result.policy_summary?.document_required_reason).toContain("exceeds 2 consecutive");
    expect(result.policy_summary?.salary_deduction_required).toBe(true);
    expect(result.policy_summary?.payroll_impact_label).toContain("Attendance Allowance");
  });
});
