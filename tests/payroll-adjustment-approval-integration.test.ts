import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  repository: {
    findEmployee: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    findPayrollRun: vi.fn(),
    findPayrollItem: vi.fn(),
    findPayslip: vi.fn(),
    findDuplicatePendingAdjustment: vi.fn(),
    createAdjustment: vi.fn(),
    findAdjustmentById: vi.fn(),
    updateAdjustmentApprovalLink: vi.fn(),
    updateAdjustmentStatus: vi.fn(),
    createAppliedLedger: vi.fn(),
    findAppliedLedger: vi.fn(),
    listAdjustments: vi.fn(),
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
  audit: { createAuditLog: vi.fn() },
  permissions: {
    isSuperAdmin: vi.fn(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasOutletAccess: vi.fn(),
    getUserRoles: vi.fn(),
  },
}));

vi.mock("../src/modules/payroll/payroll-adjustments.repository", () => mocks.repository);
vi.mock("../src/modules/approvals/approval-workflow-engine.service", () => mocks.approvalEngine);
vi.mock("../src/modules/operation-ownership/operation-ownership.service", () => mocks.operationOwnership);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permissions);

import * as service from "../src/modules/payroll/payroll-adjustments.service";
import { PAYROLL_ADJUSTMENT_TYPES } from "../src/modules/payroll/payroll-adjustments.types";
import { validatePayrollAdjustmentInput } from "../src/modules/payroll/payroll-adjustments.validators";
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
  permissions: ["payroll.adjustments.create", "payroll.adjustments.submit", "payroll.adjustments.cancel"],
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
  department_id: "dept_payroll",
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

const adjustment = (overrides: Record<string, unknown> = {}) => ({
  id: "payroll_adj_1",
  company_id: "company_1",
  employee_id: "emp_1",
  requester_employee_id: "emp_1",
  requester_user_id: "user_employee",
  department_id: "dept_payroll",
  position_id: "pos_staff",
  level: 1,
  outlet_id: "outlet_1",
  payroll_run_id: "payroll_run_1",
  payroll_item_id: "payroll_item_1",
  payslip_id: null,
  adjustment_type: "MANUAL_PAYROLL_ADJUSTMENT",
  adjustment_direction: "ADD",
  amount: 150,
  currency: "MVR",
  effective_payroll_month: "2026-06",
  reason: "Correct missing allowance",
  current_value_json: null,
  requested_value_json: "{}",
  approval_request_id: null,
  approval_status: null,
  approval_current_step: null,
  status: "DRAFT",
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
  applied_at: null,
  applied_by: null,
  apply_error_code: null,
  apply_error_message: null,
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
  mocks.permissions.getUserRoles.mockResolvedValue([{ id: "role_payroll_executor", role_key: "payroll_executor", role_name: "Payroll Executor" }]);
  mocks.repository.findEmployeeByUserId.mockResolvedValue(employee);
  mocks.repository.findEmployee.mockResolvedValue(employee);
  mocks.repository.findPayrollItem.mockResolvedValue({ id: "payroll_item_1", employee_id: "emp_1", payroll_run_id: "payroll_run_1", outlet_id: "outlet_1", status: "draft" });
  mocks.repository.findPayrollRun.mockResolvedValue({ id: "payroll_run_1", status: "draft", payroll_month: "2026-06", locked_at: null, finalized_at: null });
  mocks.repository.findDuplicatePendingAdjustment.mockResolvedValue(null);
  mocks.repository.findAdjustmentById.mockResolvedValue(adjustment());
  mocks.repository.findAppliedLedger.mockResolvedValue(null);
  mocks.repository.listAdjustments.mockResolvedValue({ rows: [adjustment()], total: 1 });
  mocks.approvalEngine.createApprovalRequestDraft.mockResolvedValue({ id: "approval_req_1", status: "DRAFT" });
  mocks.approvalEngine.submitApprovalRequest.mockResolvedValue({ id: "approval_req_1", status: "IN_REVIEW", current_step_id: "step_1", current_step_name: "Owner Review" });
  mocks.approvalEngine.approveStep.mockResolvedValue({ id: "approval_req_1", status: "APPROVED", current_step_id: null });
  mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
    status: "RESOLVED",
    target_type: "DEPARTMENT",
    resolved_department_id: "dept_payroll",
    resolved_user_id: null,
    min_level: null,
    max_level: null,
    required_permission: "payroll.adjustments.apply",
    required_role_id: null,
    message: "Resolved to payroll department.",
  });
});

describe("payroll adjustment approval integration", () => {
  it("creates a PAYROLL_ADJUSTMENT request for an employee's own payroll adjustment", async () => {
    await service.createPayrollAdjustment(env, actor(), {
      employee_id: "emp_1",
      payroll_item_id: "payroll_item_1",
      adjustment_type: "MANUAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 150,
      currency: "MVR",
      reason: "Correct missing allowance",
    });

    expect(mocks.repository.createAdjustment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      payload: expect.objectContaining({
        employee_id: "emp_1",
        requester_employee_id: "emp_1",
        department_id: "dept_payroll",
        position_id: "pos_staff",
        level: 1,
      }),
    }));
  });

  it("blocks a normal employee from creating a payroll adjustment for another employee", async () => {
    mocks.repository.findEmployee.mockResolvedValueOnce(otherEmployee);
    await expect(service.createPayrollAdjustment(env, actor(), {
      employee_id: "emp_2",
      adjustment_type: "MANUAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 100,
      reason: "Other employee adjustment",
    })).rejects.toThrow(/another employee/);
  });

  it("lets HR with payroll.adjustments.createForOthers create on behalf through module-bound approval creation", async () => {
    mocks.repository.findEmployee.mockResolvedValue(otherEmployee);
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ employee_id: "emp_2", requester_employee_id: "emp_1" }));
    const hrActor = actor({
      actorUserId: "user_hr",
      permissions: ["payroll.adjustments.create", "payroll.adjustments.createForOthers", "payroll.adjustments.submit"],
      roleKeys: ["hr_admin"],
      isAdmin: true,
    });

    await service.createPayrollAdjustment(env, hrActor, {
      employee_id: "emp_2",
      adjustment_type: "MANUAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 100,
      reason: "Approved HR correction",
    });
    await service.submitPayrollAdjustmentForApproval(env, hrActor, "payroll_adj_1");

    expect(mocks.approvalEngine.createApprovalRequestDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_type: "PAYROLL_ADJUSTMENT",
      subject_type: "PAYROLL_ADJUSTMENT",
      subject_employee_id: "emp_2",
      department_id: "dept_payroll",
      position_id: "pos_staff",
      level: 1,
    }), expect.objectContaining({
      allowModuleBoundCreateForOthers: true,
      modulePermission: "payroll.adjustments.createForOthers",
      moduleOperationType: "PAYROLL_ADJUSTMENT",
    }));
  });

  it("does not create duplicate approval requests on repeated submit", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ approval_request_id: "approval_req_existing", status: "PENDING_OWNER_REVIEW" }));
    const result = await service.submitPayrollAdjustmentForApproval(env, actor(), "payroll_adj_1");

    expect(result.already_submitted).toBe(true);
    expect(mocks.approvalEngine.createApprovalRequestDraft).not.toHaveBeenCalled();
  });

  it("cancels the linked approval request with payroll module-bound permissions", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ approval_request_id: "approval_req_1", status: "PENDING_OWNER_REVIEW" }));
    await service.cancelPayrollAdjustment(env, actor(), "payroll_adj_1", { reason: "No longer needed" });

    expect(mocks.approvalEngine.cancelRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "payroll.adjustments.cancel",
      moduleCancelAnyPermission: "payroll.adjustments.cancelAny",
      moduleOperationType: "PAYROLL_ADJUSTMENT",
    });
  });

  it("accepts every canonical payroll adjustment type and rejects unsupported types", () => {
    for (const adjustment_type of PAYROLL_ADJUSTMENT_TYPES) {
      expect(validatePayrollAdjustmentInput({
        adjustment_type,
        adjustment_direction: "ADD",
        amount: 50,
        reason: "Canonical payroll adjustment type",
      }).adjustment_type).toBe(adjustment_type);
    }
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "ADVANCE_SALARY_REQUEST",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Unsupported payroll adjustment type",
    })).toThrow(/payroll adjustment form/);
  });

  it("uses operation ownership EXECUTION responsibility before deferring approved payroll adjustment application", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    await service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" });

    expect(mocks.operationOwnership.resolveOperationResponsibility).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      operation_code: "PAYROLL_ADJUSTMENT",
      responsibility_type: "EXECUTION",
    }));
    expect(mocks.repository.createAppliedLedger).not.toHaveBeenCalled();
    expect(mocks.repository.updateAdjustmentStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "payroll_adj_1", expect.objectContaining({
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_APPROVED_NOT_APPLIED",
    }));
  });

  it("blocks a user with apply permission when execution belongs to another department", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_other",
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: "payroll.adjustments.apply",
      required_role_id: null,
      message: "Resolved elsewhere.",
    });

    await expect(service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/another department/);
    expect(mocks.repository.createAppliedLedger).not.toHaveBeenCalled();
  });

  it("enforces specific-user execution target", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "SPECIFIC_USER",
      resolved_department_id: null,
      resolved_user_id: "user_payroll_executor",
      min_level: null,
      max_level: null,
      required_permission: "payroll.adjustments.apply",
      required_role_id: null,
      message: "Resolved to specific user.",
    });

    await expect(service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/another user/);
  });

  it("enforces min/max level and required role for execution", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, level: 2 });
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValue({
      status: "RESOLVED",
      target_type: "DEPARTMENT",
      resolved_department_id: "dept_payroll",
      resolved_user_id: null,
      min_level: 3,
      max_level: 4,
      required_permission: "payroll.adjustments.apply",
      required_role_id: "role_payroll_executor",
      message: "Resolved to payroll department.",
    });

    await expect(service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/below the execution level/);

    mocks.repository.findEmployeeByUserId.mockResolvedValue({ ...employee, level: 3 });
    mocks.permissions.getUserRoles.mockResolvedValue([]);
    await expect(service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/role is not allowed/);
  });

  it("uses Super Admin fallback and blocks/holds according to operation ownership fallback", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({
      status: "USE_SUPER_ADMIN",
      target_type: "SUPER_ADMIN",
      resolved_department_id: null,
      resolved_user_id: "user_super",
      min_level: null,
      max_level: null,
      required_permission: null,
      required_role_id: null,
      message: "Fallback to Super Admin.",
    });
    await expect(service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/Only Super Admin/);

    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({ status: "BLOCKED", message: "Blocked by setup." });
    await expect(service.applyApprovedPayrollAdjustment(env, actor({ isSuperAdmin: true, roleKeys: ["super_admin"], permissions: [] }), "payroll_adj_1", { reason: "Apply after approval" }))
      .rejects.toThrow(/Blocked by setup/);

    mocks.operationOwnership.resolveOperationResponsibility.mockResolvedValueOnce({ status: "HOLD_FOR_MANUAL_ASSIGNMENT", message: "Needs manual assignment." });
    await service.applyApprovedPayrollAdjustment(env, actor({ isSuperAdmin: true, roleKeys: ["super_admin"], permissions: [] }), "payroll_adj_1", { reason: "Apply after approval" });
    expect(mocks.repository.updateAdjustmentStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "payroll_adj_1", expect.objectContaining({
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
    }));
  });

  it("marks locked payroll adjustments for manual review instead of pretending to apply", async () => {
    mocks.repository.findAdjustmentById.mockResolvedValue(adjustment({ status: "PENDING_EXECUTION", approval_request_id: "approval_req_1" }));
    mocks.repository.findPayrollRun.mockResolvedValue({ id: "payroll_run_1", status: "locked", payroll_month: "2026-06", locked_at: "2026-06-30T00:00:00Z", finalized_at: null });

    await service.applyApprovedPayrollAdjustment(env, actor({ permissions: ["payroll.adjustments.apply"] }), "payroll_adj_1", { reason: "Apply after approval" });

    expect(mocks.repository.createAppliedLedger).not.toHaveBeenCalled();
    expect(mocks.repository.updateAdjustmentStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "payroll_adj_1", expect.objectContaining({
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_REQUIRES_MANUAL_REVIEW",
    }));
  });

  it("rejects sensitive payroll adjustment payload keys", () => {
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "MANUAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Sensitive payload attempt",
      requested_value_json: { token: "secret" },
    })).toThrow(/payroll adjustment form/);
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "GENERAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Sensitive requested payload attempt",
      requested_value_json: { api_key: "hidden" },
    })).toThrow(/payroll adjustment form/);
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "GENERAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Sensitive current payload attempt",
      current_value_json: { api_key: "hidden" },
    })).toThrow(/payroll adjustment form/);
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "GENERAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Nested sensitive payload attempt",
      requested_value_json: { rows: [{ metadata: { api_key: "hidden" } }] },
    })).toThrow(/payroll adjustment form/);
    expect(() => validatePayrollAdjustmentInput({
      adjustment_type: "GENERAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Device sensitive payload attempt",
      requested_value_json: { device_secret: "hidden" },
    })).toThrow(/payroll adjustment form/);
    expect(validatePayrollAdjustmentInput({
      adjustment_type: "GENERAL_PAYROLL_ADJUSTMENT",
      adjustment_direction: "ADD",
      amount: 50,
      reason: "Safe payroll payload",
      requested_value_json: { component: "allowance", notes: ["safe context"] },
    }).requested_value_json).toEqual({ component: "allowance", notes: ["safe context"] });
  });

  it("protects generic approval routes and frontend uses payroll-specific endpoints", () => {
    const approvalService = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(approvalService).toContain("MODULE_BOUND_PAYROLL_ADJUSTMENT_ACTION_MESSAGE");
    expect(approvalService).toContain("request.operation_type === \"PAYROLL_ADJUSTMENT\"");
    expect(approvalService).toContain("payroll.adjustments.createForOthers");
    expect(approvalService).toContain("payroll.adjustments.cancelAny");

    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(approvalsPage).toContain("operation_type === \"PAYROLL_ADJUSTMENT\"");
    expect(approvalsPage).toContain("payrollApi.approveAdjustment");
    expect(approvalsPage).toContain("payrollApi.rejectAdjustment");
    expect(approvalsPage).toContain("payrollApi.cancelAdjustment");
  });

  it("has payroll adjustment frontend create/submit and permission-gated actions", () => {
    const dialog = read("frontend/src/features/payroll/PayrollAdjustmentDialog.tsx");
    const page = read("frontend/src/features/payroll/PayrollPage.tsx");
    expect(dialog).toContain("payrollApi.createAdjustment");
    expect(dialog).toContain("payrollApi.submitAdjustment");
    expect(dialog).toContain("EmployeeCombobox");
    expect(dialog).toContain("BASIC_SALARY_CORRECTION");
    expect(dialog).toContain("GENERAL_PAYROLL_ADJUSTMENT");
    expect(dialog).toContain("showAdvancedReferences");
    expect(dialog).toContain("canSelectEmployee ? (");
    expect(page).toContain("canApproveAdjustment");
    expect(page).toContain("canApplyAdjustment");
    expect(page).not.toMatch(/window\.alert\s*\(|\bconfirm\s*\(/);
  });
});
