import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as approvalRepository from "../src/modules/approvals/approval-workflow-engine.repository";
import * as approvalEngineService from "../src/modules/approvals/approval-workflow-engine.service";
import * as holidayCalculation from "../src/modules/holidays/holiday-calculation.service";
import * as holidayService from "../src/modules/holidays/holidays.service";
import * as leaveRepository from "../src/modules/leave/leave.repository";
import * as balanceService from "../src/modules/leave/leave-balance.service";
import * as policyService from "../src/modules/leave/leave-policy.service";
import * as leaveService from "../src/modules/leave/leave.service";
import * as longLeaveRepository from "../src/modules/long-leave/long-leave.repository";
import * as auditService from "../src/services/audit.service";
import * as settingsService from "../src/services/settings.service";
import type { AuthActor } from "../src/types/api.types";
import type { LeaveBalanceRecord, LeaveRequestRecord, LeaveTypeRecord } from "../src/modules/leave/leave.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const env = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    }),
    batch: async (items: unknown[]) => items,
  },
} as unknown as Env;

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_employee",
  fullName: "Employee",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: ["leave.create", "leave.requests.submit", "approvals.requests.create", "approvals.requests.cancel"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
};

const employee = {
  id: "emp_1",
  employee_code: "EMP001",
  full_name: "Aisha Employee",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  employment_status: "active",
  deleted_at: null,
  date_of_joining: "2025-01-01",
  hire_date: null,
  joined_at: null,
  exit_date: null,
  termination_date: null,
};

const otherEmployee = {
  ...employee,
  id: "emp_2",
  employee_code: "EMP002",
  full_name: "Other Employee",
};

const leaveType: LeaveTypeRecord = {
  id: "leave_annual",
  company_id: "company_1",
  leave_key: "annual",
  leave_name: "Annual Leave",
  default_days: 12,
  is_enabled: 1,
  is_statutory: 0,
  is_paid: 1,
  requires_attachment: 0,
  requires_balance: 1,
  allow_negative_balance: 0,
  max_negative_balance: 0,
  affects_payroll: 1,
  accrual_enabled: 0,
  accrual_frequency: "none",
  annual_entitlement_days: 12,
  accrual_amount: 0,
  prorate_on_joining: 0,
  prorate_on_termination: 0,
  carry_forward_enabled: 0,
  carry_forward_limit_days: 0,
  carry_forward_expiry_month: null,
  carry_forward_expiry_day: null,
  half_day_enabled: 0,
  sort_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const balance: LeaveBalanceRecord = {
  id: "balance_1",
  company_id: "company_1",
  employee_id: "emp_1",
  leave_type_id: "leave_annual",
  year: 2026,
  opening_balance: 0,
  accrued_days: 12,
  used_days: 0,
  pending_days: 0,
  adjusted_days: 0,
  carried_forward_days: 0,
  expired_days: 0,
  available_days: 12,
  entitlement_days: 12,
  remaining_days: 12,
  updated_at: "2026-01-01T00:00:00.000Z",
};

const leaveRequest = (overrides: Partial<LeaveRequestRecord> = {}): LeaveRequestRecord => ({
  id: "leave_req_1",
  company_id: "company_1",
  employee_id: "emp_1",
  leave_type_id: "leave_annual",
  start_date: "2026-06-01",
  end_date: "2026-06-02",
  total_days: 2,
  reason: "Family leave",
  status: "pending_approval",
  created_by: "user_employee",
  approval_request_id: "approval_engine_req_1",
  approval_status: "pending",
  submitted_at: "2026-06-01T00:00:00.000Z",
  submitted_by: "user_employee",
  affects_payroll: 1,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

const setupBusinessRuleMocks = () => {
  vi.spyOn(leaveRepository, "findEmployee").mockResolvedValue(employee as any);
  vi.spyOn(leaveRepository, "findEmployeeByUserId").mockResolvedValue(employee as any);
  vi.spyOn(leaveRepository, "findLeaveType").mockResolvedValue(leaveType);
  vi.spyOn(leaveRepository, "findOverlappingRequest").mockResolvedValue(null);
  vi.spyOn(leaveRepository, "findBalance").mockResolvedValue({ ...balance, pending_days: 2 } as any);
  vi.spyOn(holidayService, "getHolidaySettings").mockResolvedValue({ enabled: true } as any);
  vi.spyOn(holidayCalculation, "calculateLeaveWorkingDays").mockResolvedValue({ days: 2, holidays: [], warnings: [] } as any);
  vi.spyOn(policyService, "findApplicablePolicy").mockResolvedValue(null);
  vi.spyOn(policyService, "shouldCheckBalance").mockReturnValue(true);
  vi.spyOn(balanceService, "initializeBalanceIfNeeded").mockResolvedValue(balance);
  vi.spyOn(balanceService, "assertSufficientBalance").mockReturnValue(undefined);
  vi.spyOn(balanceService, "planBalanceTransaction").mockImplementation((input: any) => ({
    balance,
    transaction: {
      id: `tx_${input.type}`,
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      balance_id: "balance_1",
      leave_request_id: input.leaveRequestId ?? null,
      transaction_type: input.type,
      quantity_days: input.quantityDays,
      balance_before: 12,
      balance_after: 10,
      effective_date: input.effectiveDate,
      reason: input.reason,
      source: input.source,
      idempotency_key: input.idempotencyKey,
      created_by: input.createdBy,
      created_at: "2026-06-01T00:00:00.000Z",
      metadata_json: null,
    },
  }));
  vi.spyOn(settingsService, "isFeatureEnabled").mockResolvedValue(false);
  vi.spyOn(longLeaveRepository, "getLongLeaveSettings").mockResolvedValue({ trigger_days: 30 } as any);
  vi.spyOn(auditService, "createAuditLog").mockResolvedValue({ created: true } as any);
};

afterEach(() => vi.restoreAllMocks());

describe("leave approval engine integration", () => {
  it("creates and submits an engine approval request while reserving pending balance", async () => {
    setupBusinessRuleMocks();
    let capturedRequest: LeaveRequestRecord | null = null;
    let capturedTransactionType = "";
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(true);
    vi.spyOn(leaveRepository, "findEngineApprovalRequestForLeave").mockResolvedValue(null);
    vi.spyOn(approvalEngineService, "createApprovalRequestDraft").mockResolvedValue({ id: "approval_engine_req_1", status: "DRAFT" } as any);
    vi.spyOn(approvalEngineService, "submitApprovalRequest").mockResolvedValue({
      id: "approval_engine_req_1",
      status: "IN_REVIEW",
      current_step_id: "approval_step_1",
      current_step_name: "Department Approval",
      submitted_at: "2026-06-01T00:00:00.000Z",
    } as any);
    vi.spyOn(leaveRepository, "createLeaveRequestWithBalanceTransaction").mockImplementation(async (_env, request, entry) => {
      capturedRequest = request;
      capturedTransactionType = entry.transaction.transaction_type;
      return [] as any;
    });
    vi.spyOn(leaveRepository, "findRequest").mockImplementation(async () => capturedRequest as any);

    await leaveService.createRequest(env, actor, {
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      reason: "Family leave",
    });

    expect(approvalEngineService.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "LEAVE_REQUEST",
      subject_type: "LEAVE_REQUEST",
      subject_id: expect.stringMatching(/^leave_req_/),
      subject_employee_id: "emp_1",
    }), expect.objectContaining({
      allowModuleBoundCreateForOthers: true,
      modulePermission: "leave.requests.create_for_employee",
      moduleOperationType: "LEAVE_REQUEST",
    }));
    expect(approvalEngineService.submitApprovalRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_engine_req_1");
    expect(capturedRequest).toMatchObject({
      approval_request_id: "approval_engine_req_1",
      approval_current_step: "Department Approval",
      approval_status: "pending",
    });
    expect(capturedTransactionType).toBe("request_reserved");
  });

  it("final approval goes through approvalEngineService.approveStep and applies leave_used balance deduction", async () => {
    setupBusinessRuleMocks();
    vi.spyOn(leaveRepository, "findRequest").mockResolvedValue(leaveRequest() as any);
    vi.spyOn(leaveRepository, "findEngineApprovalRequestForLeave").mockResolvedValue({ id: "approval_engine_req_1", status: "IN_REVIEW", current_step_id: "step_hr", current_step_name: "HR Final Approval" } as any);
    vi.spyOn(approvalEngineService, "approveStep").mockResolvedValue({ id: "approval_engine_req_1", status: "APPROVED", approved_at: "2026-06-01T00:00:00.000Z" } as any);
    vi.spyOn(approvalEngineService, "getTimeline").mockResolvedValue({
      request: { id: "approval_engine_req_1", status: "APPROVED", current_step_id: null, current_step_name: null } as any,
      steps: [{ id: "step_hr", company_id: "company_1", status: "APPROVED", approver_resolver_type: "HR_FINAL_APPROVER", approved_at: "2026-06-01T00:00:00.000Z", assigned_approver_user_id: "user_hr" }],
      actions: [],
    } as any);
    const update = vi.spyOn(leaveRepository, "updateLeaveRequestStatusWithBalanceTransaction").mockResolvedValue([] as any);

    await expect(leaveService.approveRequest(env, { ...actor, actorUserId: "user_hr", permissions: ["approvals.hrFinal.approve"] }, "leave_req_1", { reason: "Approved" }))
      .resolves.toMatchObject({ approved: true });

    expect(approvalEngineService.approveStep).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_engine_req_1", "Approved", { allowModuleBoundAction: true });
    expect(update.mock.calls[0][3]).toMatchObject({ status: "approved", approval_status: "approved", hr_approved_by: "user_hr" });
    expect(update.mock.calls[0][4].transaction.transaction_type).toBe("leave_used");
  });

  it("rejects and cancels pending engine-linked leave requests through the engine and releases pending balance", async () => {
    setupBusinessRuleMocks();
    vi.spyOn(leaveRepository, "findRequest").mockResolvedValue(leaveRequest() as any);
    vi.spyOn(leaveRepository, "findEngineApprovalRequestForLeave").mockResolvedValue({ id: "approval_engine_req_1", status: "IN_REVIEW", current_step_id: "step_dept", current_step_name: "Department Approval" } as any);
    vi.spyOn(approvalEngineService, "rejectStep").mockResolvedValue({ id: "approval_engine_req_1", status: "REJECTED", rejected_at: "2026-06-01T00:00:00.000Z" } as any);
    vi.spyOn(approvalEngineService, "cancelRequest").mockResolvedValue({ id: "approval_engine_req_1", status: "CANCELLED", cancelled_at: "2026-06-01T00:00:00.000Z" } as any);
    vi.spyOn(approvalEngineService, "getTimeline").mockResolvedValue({ request: { id: "approval_engine_req_1", status: "REJECTED", current_step_id: null, current_step_name: null } as any, steps: [], actions: [] } as any);
    const update = vi.spyOn(leaveRepository, "updateLeaveRequestStatusWithBalanceTransaction").mockResolvedValue([] as any);

    await leaveService.rejectRequest(env, { ...actor, actorUserId: "user_dept", permissions: ["approvals.department.reject"] }, "leave_req_1", { reason: "Not enough coverage" });
    expect(approvalEngineService.rejectStep).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_engine_req_1", "Not enough coverage", "Not enough coverage", { allowModuleBoundAction: true });
    expect(update.mock.calls[0][3]).toMatchObject({ status: "rejected", approval_status: "rejected", rejection_reason: "Not enough coverage" });
    expect(update.mock.calls[0][4].transaction.transaction_type).toBe("request_released");

    await leaveService.cancelRequest(env, actor, "leave_req_1", { reason: "No longer needed" });
    expect(approvalEngineService.cancelRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_engine_req_1", "No longer needed", { allowModuleBoundAction: true });
  });

  it("enforces create-for-others in the leave service when approval is disabled or enabled", async () => {
    setupBusinessRuleMocks();
    vi.spyOn(leaveRepository, "findEmployee").mockResolvedValue(otherEmployee as any);
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(false);

    await expect(leaveService.createRequest(env, actor, {
      employee_id: "emp_2",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      reason: "Family leave",
    })).rejects.toThrow("You can only create leave requests for your own employee profile.");

    vi.mocked(settingsService.shouldRequireApproval).mockResolvedValue(true);
    await expect(leaveService.createRequest(env, actor, {
      employee_id: "emp_2",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      reason: "Family leave",
    })).rejects.toThrow("You can only create leave requests for your own employee profile.");
  });

  it("allows HR/Admin with explicit create-for-others permission to create leave for another employee", async () => {
    setupBusinessRuleMocks();
    vi.spyOn(leaveRepository, "findEmployee").mockResolvedValue(otherEmployee as any);
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(false);
    vi.spyOn(leaveRepository, "createLeaveRequestWithBalanceTransaction").mockResolvedValue([] as any);
    vi.spyOn(leaveRepository, "findRequest").mockResolvedValue(leaveRequest({ employee_id: "emp_2", status: "approved", approval_status: "approved" }) as any);

    await expect(leaveService.createRequest(env, {
      ...actor,
      actorUserId: "user_hr",
      permissions: ["leave.create", "leave.requests.create_for_employee"],
      isAdmin: true,
    }, {
      employee_id: "emp_2",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      reason: "Family leave",
    })).resolves.toMatchObject({ leave_request: expect.objectContaining({ employee_id: "emp_2" }) });
  });

  it("lets leave-specific HR/Admin create-for-others create approval-enabled leave without broad approval create-for-others permission", async () => {
    setupBusinessRuleMocks();
    let capturedRequest: LeaveRequestRecord | null = null;
    vi.spyOn(leaveRepository, "findEmployee").mockResolvedValue({ ...otherEmployee, department_id: "dept_hr", position_id: "pos_subject", level: 2 } as any);
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(true);
    vi.spyOn(leaveRepository, "findEngineApprovalRequestForLeave").mockResolvedValue(null);
    const createDraft = vi.spyOn(approvalEngineService, "createApprovalRequestDraft").mockResolvedValue({ id: "approval_engine_req_2", status: "DRAFT" } as any);
    vi.spyOn(approvalEngineService, "submitApprovalRequest").mockResolvedValue({
      id: "approval_engine_req_2",
      status: "IN_REVIEW",
      current_step_id: "approval_step_2",
      current_step_name: "Department Approval",
      submitted_at: "2026-06-01T00:00:00.000Z",
    } as any);
    vi.spyOn(leaveRepository, "createLeaveRequestWithBalanceTransaction").mockImplementation(async (_env, request) => {
      capturedRequest = request;
      return [] as any;
    });
    vi.spyOn(leaveRepository, "findRequest").mockImplementation(async () => capturedRequest as any);

    await leaveService.createRequest(env, {
      ...actor,
      actorUserId: "user_hr",
      permissions: ["leave.create", "leave.requests.create_for_employee"],
      isAdmin: true,
    }, {
      employee_id: "emp_2",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      reason: "Family leave",
    });

    expect(createDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "LEAVE_REQUEST",
      subject_type: "LEAVE_REQUEST",
      subject_employee_id: "emp_2",
      payload_json: expect.objectContaining({ employee_id: "emp_2" }),
    }), expect.objectContaining({
      allowModuleBoundCreateForOthers: true,
      modulePermission: "leave.requests.create_for_employee",
      moduleOperationType: "LEAVE_REQUEST",
    }));
    expect(capturedRequest).toMatchObject({
      employee_id: "emp_2",
      approval_request_id: "approval_engine_req_2",
      approval_current_step: "Department Approval",
    });
  });

  it("returns existing engine approval state for repeated submit without creating duplicates", async () => {
    setupBusinessRuleMocks();
    vi.spyOn(leaveRepository, "findRequest").mockResolvedValue(leaveRequest() as any);
    vi.spyOn(leaveRepository, "findEngineApprovalRequestForLeave").mockResolvedValue({
      id: "approval_engine_req_1",
      status: "IN_REVIEW",
      current_step_id: "step_hr",
      current_step_name: "HR Final Approval",
    } as any);
    const createDraft = vi.spyOn(approvalEngineService, "createApprovalRequestDraft");
    const submitEngine = vi.spyOn(approvalEngineService, "submitApprovalRequest");

    await expect(leaveService.submitRequest(env, actor, "leave_req_1", { reason: "Submit again" }))
      .resolves.toMatchObject({
        submitted: true,
        already_submitted: true,
        already_applied: true,
        approval_request_id: "approval_engine_req_1",
        approval_current_step: "HR Final Approval",
      });

    expect(createDraft).not.toHaveBeenCalled();
    expect(submitEngine).not.toHaveBeenCalled();
  });

  it("blocks generic approval engine mutations for LEAVE_REQUEST records", async () => {
    const approvalRequest = {
      id: "approval_engine_req_1",
      company_id: "company_1",
      workflow_id: "workflow_1",
      operation_type: "LEAVE_REQUEST",
      subject_type: "LEAVE_REQUEST",
      subject_id: "leave_req_1",
      requester_employee_id: "emp_1",
      requester_user_id: "user_employee",
      status: "IN_REVIEW",
      current_step_id: "step_1",
    };
    const approvalStep = {
      id: "step_1",
      company_id: "company_1",
      approval_request_id: "approval_engine_req_1",
      workflow_step_id: "workflow_step_1",
      step_order: 1,
      step_code: "HR",
      step_name: "HR Final",
      approver_resolver_type: "HR_FINAL_APPROVER",
      assigned_approver_user_id: "user_hr",
      assigned_approver_employee_id: "emp_hr",
      assigned_department_id: null,
      required_permission: "approvals.hrFinal.approve",
      required_role_id: null,
      required_min_level: null,
      required_max_level: null,
      status: "PENDING",
    };
    vi.spyOn(approvalRepository, "findRequestById").mockResolvedValue(approvalRequest as any);
    vi.spyOn(approvalRepository, "listRequestSteps").mockResolvedValue([approvalStep] as any);

    const hrActor = { ...actor, actorUserId: "user_hr", permissions: ["approvals.hrFinal.approve", "approvals.hrFinal.reject", "approvals.requests.cancel"] };
    await expect(approvalEngineService.approveStep(env, hrActor, "approval_engine_req_1", "Approved"))
      .rejects.toThrow("Leave requests must be approved from the Leave module so leave status and balance are updated safely.");
    await expect(approvalEngineService.rejectStep(env, hrActor, "approval_engine_req_1", "No", "No"))
      .rejects.toThrow("Leave requests must be approved from the Leave module so leave status and balance are updated safely.");
    await expect(approvalEngineService.cancelRequest(env, hrActor, "approval_engine_req_1", "No longer needed"))
      .rejects.toThrow("Leave requests must be approved from the Leave module so leave status and balance are updated safely.");
  });

  it("keeps route, frontend, and verifier coverage for leave approval engine integration", () => {
    const service = read("src/modules/leave/leave.service.ts");
    const routes = read("src/routes/leave.routes.ts");
    const verifier = read("scripts/verify-leave-approval-engine.mjs");
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    const leaveForm = read("frontend/src/features/leave/LeaveRequestForm.tsx");
    const frontendTimeline = read("frontend/src/features/leave/LeaveApprovalTimelineDialog.tsx");

    expect(service).toContain("submitLeaveEngineApproval");
    expect(service).toContain("assertLeaveRequestSubjectAllowed");
    expect(service).toContain("buildLeaveRequestVisibilityFilter");
    expect(service).toContain("already_submitted");
    expect(service).toContain("approvalEngineService.approveStep");
    expect(routes).toContain("approvals.department.approve");
    expect(routes).toContain("approvals.hrFinal.approve");
    expect(approvalsPage).toContain("leaveApi.approveRequest");
    expect(approvalsPage).toContain("operation_type === \"LEAVE_REQUEST\"");
    expect(leaveForm).toContain("canCreateForOthers");
    expect(leaveForm).toContain("Your employee profile is not linked to this login.");
    expect(frontendTimeline).toContain("Approval engine");
    expect(verifier).toContain("approvalEngineService.cancelRequest");
  });
});
