import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  repository: {
    findEmployee: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    listRequests: vi.fn(),
    findRequestById: vi.fn(),
    findDuplicatePendingRequest: vi.fn(),
    createRequest: vi.fn(),
    updateApprovalLink: vi.fn(),
    updateRequestStatus: vi.fn(),
    findPaymentLedger: vi.fn(),
    countDeductionSchedule: vi.fn(),
    createPaymentLedger: vi.fn(),
    createDeductionSchedule: vi.fn(),
    createPaymentBundle: vi.fn(),
    listDeductionSchedule: vi.fn(),
    createLegacyApprovedAdvance: vi.fn(),
  },
  approvalEngine: {
    createApprovalRequestDraft: vi.fn(),
    submitApprovalRequest: vi.fn(),
    approveStep: vi.fn(),
    rejectStep: vi.fn(),
    cancelRequest: vi.fn(),
    getTimeline: vi.fn(),
  },
  operationOwnership: { resolveOperationResponsibility: vi.fn() },
  payrollLock: { assertPayrollMonthUnlocked: vi.fn() },
  audit: { createAuditLog: vi.fn() },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasOutletAccess: vi.fn(),
    getUserRoles: vi.fn(),
  },
}));

vi.mock("../src/modules/advances/advance-salary.repository", () => mocks.repository);
vi.mock("../src/modules/approvals/approval-workflow-engine.service", () => mocks.approvalEngine);
vi.mock("../src/modules/operation-ownership/operation-ownership.service", () => mocks.operationOwnership);
vi.mock("../src/modules/payroll/payroll-lock.service", () => mocks.payrollLock);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permissions);

import * as service from "../src/modules/advances/advance-salary.service";
import { ADVANCE_SALARY_REQUEST_TYPES, type AdvanceSalaryRequestRecord } from "../src/modules/advances/advance-salary.types";
import { validateAdvanceSalaryInput } from "../src/modules/advances/advance-salary.validators";
import type { AuthActor } from "../src/types/api.types";

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
  permissions: ["advanceSalary.requests.create", "advanceSalary.requests.submit", "advanceSalary.requests.cancel"],
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
  archived_at: null,
  deleted_at: null,
};

const otherEmployee = {
  ...employee,
  id: "emp_2",
  employee_code: "EMP002",
  full_name: "Other Employee",
};

const advanceRequest = (overrides: Partial<AdvanceSalaryRequestRecord> = {}): AdvanceSalaryRequestRecord => ({
  id: "advance_salary_1",
  company_id: "company_1",
  employee_id: "emp_1",
  requester_employee_id: "emp_1",
  requester_user_id: "user_employee",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  outlet_id: "outlet_1",
  payroll_month: "2026-06",
  payroll_year: 2026,
  request_type: "SALARY_ADVANCE",
  requested_amount: 1000,
  approved_amount: null,
  paid_amount: null,
  outstanding_amount: 1000,
  currency: "MVR",
  requested_payment_date: "2026-06-20",
  approved_payment_date: null,
  actual_payment_date: null,
  repayment_start_month: "2026-07",
  repayment_start_year: 2026,
  repayment_months: 2,
  repayment_amount_per_month: 500,
  repayment_policy_json: null,
  reason: "Emergency advance",
  employee_note: null,
  owner_note: null,
  final_approver_note: null,
  payment_note: null,
  status: "DRAFT",
  payment_status: "NOT_READY",
  deduction_status: "NOT_SCHEDULED",
  approval_request_id: null,
  approval_status: null,
  approval_current_step: null,
  current_step_name: null,
  owner_reviewed_at: null,
  owner_reviewed_by: null,
  final_approved_at: null,
  final_approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  approval_submitted_at: null,
  approval_completed_at: null,
  payment_executed_at: null,
  payment_executed_by: null,
  payment_error_code: null,
  payment_error_message: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  created_by: "user_employee",
  updated_by: "user_employee",
  archived_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin);
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.isSuperAdmin || context.permissions.includes(permission));
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => context.isSuperAdmin || permissions.some((permission) => context.permissions.includes(permission)));
  mocks.permissions.hasOutletAccess.mockImplementation((context: AuthActor, outletId?: string | null) => !outletId || context.isSuperAdmin || context.outletIds.includes(outletId));
  mocks.permissions.getUserRoles.mockResolvedValue([{ id: "role_advance_executor", role_key: "advance_executor", role_name: "Advance Executor" }]);
  mocks.repository.findEmployeeByUserId.mockResolvedValue(employee);
  mocks.repository.findEmployee.mockResolvedValue(employee);
  mocks.repository.findDuplicatePendingRequest.mockResolvedValue(null);
  mocks.repository.findRequestById.mockResolvedValue(advanceRequest());
  mocks.repository.findPaymentLedger.mockResolvedValue(null);
  mocks.repository.countDeductionSchedule.mockResolvedValue({ total: 0 });
  mocks.repository.listRequests.mockResolvedValue({ rows: [advanceRequest()], total: 1 });
  mocks.repository.listDeductionSchedule.mockResolvedValue([]);
  mocks.approvalEngine.createApprovalRequestDraft.mockResolvedValue({ id: "approval_req_1", status: "DRAFT" });
  mocks.approvalEngine.submitApprovalRequest.mockResolvedValue({ id: "approval_req_1", status: "IN_REVIEW", current_step_id: "step_1", current_step_name: "Owner Review" });
  mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });
  mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
    status: "RESOLVED",
    target_type: "DEPARTMENT",
    resolved_department_id: "dept_ops",
    resolved_user_id: null,
    min_level: null,
    max_level: null,
    required_permission: "advanceSalary.payments.execute",
    required_role_id: null,
    message: "Resolved to operations department.",
  });
});

describe("advance salary approval integration", () => {
  it("creates an ADVANCE_SALARY_REQUEST for an employee's own linked profile", async () => {
    await service.createAdvanceSalaryRequest(env, actor(), {
      request_type: "SALARY_ADVANCE",
      requested_amount: 1000,
      repayment_start_month: "2026-07",
      repayment_months: 2,
      reason: "Emergency advance",
    });

    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      payload: expect.objectContaining({
        employee_id: "emp_1",
        requester_employee_id: "emp_1",
        department_id: "dept_ops",
        position_id: "pos_staff",
        level: 1,
        repayment_amount_per_month: 500,
      }),
    }));
  });

  it("blocks normal employees from creating advance salary requests for another employee", async () => {
    mocks.repository.findEmployee.mockResolvedValueOnce(otherEmployee);
    await expect(service.createAdvanceSalaryRequest(env, actor(), {
      employee_id: "emp_2",
      request_type: "SALARY_ADVANCE",
      requested_amount: 700,
      reason: "Other employee advance",
    })).rejects.toThrow(/another employee/);
  });

  it("lets HR with advanceSalary.requests.createForOthers create and submit on behalf through module-bound approval creation", async () => {
    const hrActor = actor({
      actorUserId: "user_hr",
      permissions: ["advanceSalary.requests.create", "advanceSalary.requests.createForOthers", "advanceSalary.requests.submit", "advanceSalary.requests.view"],
      roleKeys: ["hr_admin"],
      isAdmin: true,
    });
    mocks.repository.findEmployee.mockResolvedValue(otherEmployee);
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ employee_id: "emp_2", requester_employee_id: "emp_1", requester_user_id: "user_hr" }));

    await service.createAdvanceSalaryRequest(env, hrActor, {
      employee_id: "emp_2",
      request_type: "EMERGENCY_ADVANCE",
      requested_amount: 700,
      reason: "HR-created emergency advance",
    });
    await service.submitAdvanceSalaryForApproval(env, hrActor, "advance_salary_1");

    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "ADVANCE_SALARY_REQUEST",
      subject_type: "ADVANCE_SALARY_REQUEST",
      subject_employee_id: "emp_2",
      department_id: "dept_ops",
      position_id: "pos_staff",
      level: 1,
    }), expect.objectContaining({
      allowModuleBoundCreateForOthers: true,
      modulePermission: "advanceSalary.requests.createForOthers",
      moduleOperationType: "ADVANCE_SALARY_REQUEST",
    }));
  });

  it("does not create duplicate approval requests on repeated submit", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ approval_request_id: "approval_req_existing", status: "PENDING_OWNER_REVIEW" }));
    const result = await service.submitAdvanceSalaryForApproval(env, actor(), "advance_salary_1");

    expect(result.already_submitted).toBe(true);
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("uses advance module-bound permissions when cancelling a linked approval request", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ approval_request_id: "approval_req_1", status: "PENDING_OWNER_REVIEW" }));
    await service.cancelAdvanceSalaryRequest(env, actor(), "advance_salary_1", { reason: "No longer needed" });

    expect(mocks.approvalEngine.cancelRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "advanceSalary.requests.cancel",
      moduleCancelAnyPermission: "advanceSalary.requests.cancelAny",
      moduleOperationType: "ADVANCE_SALARY_REQUEST",
    });
  });

  it("final approval moves advance salary request to pending payment instead of paid", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ approval_request_id: "approval_req_1", status: "PENDING_FINAL_APPROVAL" }));
    await service.approveAdvanceSalaryStep(env, actor({ permissions: ["advanceSalary.requests.finalApprove"] }), "advance_salary_1", { reason: "Final approval" });

    expect(mocks.repository.updateRequestStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "advance_salary_1", expect.objectContaining({
      status: "PENDING_PAYMENT",
      payment_status: "PENDING_PAYMENT",
      approved_amount: 1000,
    }));
  });

  it("repayment_months=1 creates one deduction schedule row", async () => {
    const rows = service.buildAdvanceSalaryDeductionSchedule(advanceRequest({ repayment_months: 1 }), 1000, "2026-07");
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.payrollMonth)).toEqual(["2026-07"]);
    expect(rows.reduce((total, row) => total + row.amount, 0)).toBe(1000);
  });

  it("repayment_months=2 creates two rows whose total equals paid amount", async () => {
    const rows = service.buildAdvanceSalaryDeductionSchedule(advanceRequest({ repayment_months: 2 }), 1000, "2026-07");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.payrollMonth, row.amount])).toEqual([["2026-07", 500], ["2026-08", 500]]);
    expect(rows.reduce((total, row) => total + row.amount, 0)).toBe(1000);
  });

  it("repayment months crossing year boundary are generated correctly", async () => {
    const rows = service.buildAdvanceSalaryDeductionSchedule(advanceRequest({ repayment_months: 3 }), 900, "2026-12");
    expect(rows.map((row) => row.payrollMonth)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("rounding remainder is handled in the final month", async () => {
    const rows = service.buildAdvanceSalaryDeductionSchedule(advanceRequest({ repayment_months: 3 }), 1000, "2026-07");
    expect(rows.map((row) => row.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100)).toBe(100000);
  });

  it("locked payroll month blocks schedule before payment writes", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000, repayment_months: 2 }));
    mocks.payrollLock.assertPayrollMonthUnlocked.mockRejectedValueOnce(new Error("Payroll month is locked."));

    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay advance" }))
      .rejects.toThrow(/locked/);
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("executes payment only after resolving ADVANCE_SALARY_PAYMENT execution ownership", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    await service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Paid by payroll", payment_date: "2026-06-21" });

    expect(mocks.operationOwnership.resolveOperationResponsibility).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_code: "ADVANCE_SALARY_PAYMENT",
      responsibility_type: "EXECUTION",
    }));
    expect(mocks.repository.createPaymentBundle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      deductions: expect.arrayContaining([
        expect.objectContaining({ payrollMonth: "2026-07", amount: 500 }),
        expect.objectContaining({ payrollMonth: "2026-08", amount: 500 }),
      ]),
      deductionMonth: "2026-07",
    }));
  });

  it("blocks payment execution when Operation Ownership assigns execution to another department", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_finance",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "advanceSalary.payments.execute",
      required_role_id: null,
      message: "Resolved to finance.",
    });

    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Paid by payroll" }))
      .rejects.toThrow(/another department/);
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("returns already_paid only when ledger, schedule, and paid status are complete", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PAID", payment_status: "PAID", deduction_status: "SCHEDULED", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.repository.findPaymentLedger.mockResolvedValue({ id: "ledger_1" });
    mocks.repository.countDeductionSchedule.mockResolvedValue({ total: 2 });
    const paidResult = await service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Already paid" });
    expect(paidResult.already_paid).toBe(true);
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("ledger exists but request is not paid causes manual review instead of already_paid", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.repository.findPaymentLedger.mockResolvedValue({ id: "ledger_1" });
    mocks.repository.countDeductionSchedule.mockResolvedValue({ total: 0 });
    const result = await service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Already paid" });
    expect(result.manual_review_required).toBe(true);
    expect(mocks.repository.updateRequestStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "advance_salary_1", expect.objectContaining({
      status: "PENDING_MANUAL_REVIEW",
      payment_error_code: "ADVANCE_SALARY_PAYMENT_PARTIAL_STATE",
    }));
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("payment bundle failure marks request failed instead of silently applying", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.repository.createPaymentBundle.mockRejectedValueOnce(new Error("Legacy advance insert failed."));

    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay advance" }))
      .rejects.toThrow(/Legacy advance insert failed/);
    expect(mocks.repository.updateRequestStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "advance_salary_1", expect.objectContaining({
      status: "FAILED_TO_PAY",
      payment_status: "FAILED",
      payment_error_code: "ADVANCE_SALARY_PAYMENT_FAILED",
    }));
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "advance_salary_payment_failed" }));
  });

  it("duplicate schedule rows block payment before creating payment bundle", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.repository.countDeductionSchedule.mockResolvedValue({ total: 1 });

    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay advance" }))
      .rejects.toThrow(/deduction schedule already exists/);
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("operation executor permission can execute when matrix requires it", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "approvals.operationExecutor.apply",
      required_role_id: null,
      message: "Resolved to operation executor.",
    });
    await service.executeAdvanceSalaryPayment(env, actor({ permissions: ["approvals.operationExecutor.apply"] }), "advance_salary_1", { reason: "Paid by operation executor" });
    expect(mocks.repository.createPaymentBundle).toHaveBeenCalled();
  });

  it("operation executor apply permission can list and open eligible pending-payment requests", async () => {
    const pendingPayment = advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: null, approved_amount: 1000 });
    mocks.repository.listRequests.mockResolvedValue({ rows: [pendingPayment], total: 1 });
    mocks.repository.findRequestById.mockResolvedValue(pendingPayment);
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "approvals.operationExecutor.apply",
      required_role_id: null,
      message: "Resolved to operation executor.",
    });

    const context = actor({ permissions: ["approvals.operationExecutor.apply"] });
    const list = await service.listAdvanceSalaryRequests(env, context, { page: 1, page_size: 25 });
    const detail = await service.getAdvanceSalaryRequest(env, context, "advance_salary_1");

    expect(list.rows).toHaveLength(1);
    expect(detail.advance_salary_request.id).toBe("advance_salary_1");
  });

  it("operation executor view permission can view eligible pending-payment requests without execute permission", async () => {
    const pendingPayment = advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: null, approved_amount: 1000 });
    mocks.repository.findRequestById.mockResolvedValue(pendingPayment);
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "approvals.operationExecutor.apply",
      required_role_id: null,
      message: "Resolved to operation executor.",
    });

    const detail = await service.getAdvanceSalaryRequest(env, actor({ permissions: ["approvals.operationExecutor.view"] }), "advance_salary_1");

    expect(detail.advance_salary_request.id).toBe("advance_salary_1");
    expect(mocks.repository.createPaymentBundle).not.toHaveBeenCalled();
  });

  it("operation executor route permission still cannot view outside the Operation Ownership execution target", async () => {
    const pendingPayment = advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: null, approved_amount: 1000 });
    mocks.repository.findRequestById.mockResolvedValue(pendingPayment);
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, id: "emp_executor", employee_code: "EMP999", department_id: "dept_finance", level: 3 });
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "approvals.operationExecutor.apply",
      required_role_id: null,
      message: "Resolved to operation executor.",
    });

    await expect(service.getAdvanceSalaryRequest(env, actor({ actorUserId: "user_executor", permissions: ["approvals.operationExecutor.apply"] }), "advance_salary_1"))
      .rejects.toThrow(/another department|access/);
  });

  it("enforces specific user, min/max level, and required role for payment execution", async () => {
    mocks.repository.findRequestById.mockResolvedValue(advanceRequest({ status: "PENDING_PAYMENT", approval_request_id: "approval_req_1", approved_amount: 1000 }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({
      status: "RESOLVED",
      target_type: "SPECIFIC_USER",
      resolved_department_id: null,
      resolved_user_id: "user_executor",
      min_level: null,
      max_level: null,
      required_permission: "advanceSalary.payments.execute",
      required_role_id: null,
      message: "Specific user.",
    });
    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay" }))
      .rejects.toThrow(/another user/);

    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: 3,
      max_level: 4,
      required_permission: "advanceSalary.payments.execute",
      required_role_id: "role_advance_executor",
      message: "Level-gated.",
    });
    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay" }))
      .rejects.toThrow(/below the execution level/);

    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, level: 3 });
    mocks.permissions.getUserRoles.mockResolvedValue([]);
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_ops",
      resolved_user_id: null,
      min_level: 3,
      max_level: 4,
      required_permission: "advanceSalary.payments.execute",
      required_role_id: "role_advance_executor",
      message: "Role-gated.",
    });
    await expect(service.executeAdvanceSalaryPayment(env, actor({ permissions: ["advanceSalary.payments.execute"] }), "advance_salary_1", { reason: "Pay" }))
      .rejects.toThrow(/role is not allowed/);
  });

  it("accepts canonical advance salary request types and rejects sensitive payload keys", () => {
    for (const request_type of ADVANCE_SALARY_REQUEST_TYPES) {
      expect(validateAdvanceSalaryInput({
        request_type,
        requested_amount: 100,
        reason: "Canonical advance salary request type",
      }).request_type).toBe(request_type);
    }
    expect(() => validateAdvanceSalaryInput({
      request_type: "SALARY_ADVANCE",
      requested_amount: 100,
      reason: "Sensitive payload attempt",
      repayment_policy_json: { api_key: "hidden" },
    })).toThrow(/advance salary request/);
    expect(() => validateAdvanceSalaryInput({
      request_type: "SALARY_ADVANCE",
      requested_amount: 100,
      reason: "Nested sensitive payload attempt",
      repayment_policy_json: { rows: [{ device_secret: "hidden" }] },
    })).toThrow(/advance salary request/);
    expect(validateAdvanceSalaryInput({
      request_type: "SALARY_ADVANCE",
      requested_amount: 100,
      reason: "Safe payload",
      repayment_policy_json: { repayment_note: "Deduct over two months" },
    }).repayment_policy_json).toEqual({ repayment_note: "Deduct over two months" });
  });

  it("protects generic approval routes and frontend uses advance-specific endpoints", () => {
    const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(approvalService).toContain("MODULE_BOUND_ADVANCE_SALARY_ACTION_MESSAGE");
    expect(approvalService).toContain("request.operation_type === \"ADVANCE_SALARY_REQUEST\"");
    expect(approvalService).toContain("advanceSalary.requests.createForOthers");
    expect(approvalService).toContain("advanceSalary.requests.cancelAny");

    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(approvalsPage).toContain("operation_type === \"ADVANCE_SALARY_REQUEST\"");
    expect(approvalsPage).toContain("advancesApi.approveSalaryRequest");
    expect(approvalsPage).toContain("advancesApi.rejectSalaryRequest");
    expect(approvalsPage).toContain("advancesApi.cancelSalaryRequest");
  });

  it("has frontend create/submit, timeline, and payment execution UI", () => {
    const page = read("frontend/src/features/advances/AdvancesPage.tsx");
    const dialog = read("frontend/src/features/advances/AdvanceSalaryRequestDialog.tsx");
    const table = read("frontend/src/features/advances/AdvanceSalaryRequestsTable.tsx");
    const drawer = read("frontend/src/features/advances/AdvanceSalaryDetailDrawer.tsx");
    const routes = read("src/routes/advances.routes.ts");
    expect(dialog).toContain("advancesApi.createSalaryRequest");
    expect(dialog).toContain("advancesApi.submitSalaryRequest");
    expect(dialog).toContain("EmployeeCombobox");
    expect(dialog).toContain("canSelectEmployee ? (");
    expect(page).toContain("executeSalaryPayment");
    expect(page).toContain("salaryRequestTimeline");
    expect(table).toContain("Execute payment");
    expect(drawer).toContain("Deduction schedule");
    expect(drawer).toContain("Payment is recorded but deduction schedule needs review.");
    expect(routes).toContain("/salary-requests/:id/deductions");
    expect(routes).toMatch(/salary-requests", requireAnyPermission\(\[[^\]]*"approvals\.operationExecutor\.view"[^\]]*"approvals\.operationExecutor\.apply"/s);
    expect(routes).toMatch(/salary-requests\/:id", requireAnyPermission\(\[[^\]]*"approvals\.operationExecutor\.view"[^\]]*"approvals\.operationExecutor\.apply"/s);
    expect(routes).toContain("approvals.operationExecutor.apply");
    expect(page).toContain("hasAdvancePermission(\"approvals.operationExecutor.apply\")");
    expect(page).not.toContain("hasAdvancePermission(\"approvals.operationExecutor.view\") || hasAdvancePermission(\"advanceSalary.payments.execute\")");
    expect(page + dialog + table + drawer).not.toMatch(/window\.alert\s*\(|\bconfirm\s*\(/);
  });
});
