import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    countWorkflows: vi.fn(),
    listWorkflows: vi.fn(),
    findWorkflowById: vi.fn(),
    findWorkflowByCode: vi.fn(),
    findWorkflowForOperation: vi.fn(),
    createWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    setWorkflowStatus: vi.fn(),
    archiveWorkflow: vi.fn(),
    listWorkflowSteps: vi.fn(),
    findWorkflowStepById: vi.fn(),
    findStepByOrder: vi.fn(),
    createWorkflowStep: vi.fn(),
    updateWorkflowStep: vi.fn(),
    setWorkflowStepActive: vi.fn(),
    countRequests: vi.fn(),
    listRequests: vi.fn(),
    findRequestById: vi.fn(),
    createRequest: vi.fn(),
    updateRequestStatus: vi.fn(),
    createRequestStep: vi.fn(),
    listRequestSteps: vi.fn(),
    findRequestStepById: vi.fn(),
    updateRequestStepStatus: vi.fn(),
    createAction: vi.fn(),
    listActions: vi.fn(),
    findDepartmentHeadApprover: vi.fn(),
    findDepartmentLevelApprovers: vi.fn(),
    findPermissionApprovers: vi.fn(),
    findSpecificUserApprover: vi.fn(),
    findSuperAdminApprovers: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    findEmployeeForApproval: vi.fn(),
    findAssignableApprover: vi.fn(),
  },
  audit: { createAuditLog: vi.fn() },
  permissions: {
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    isSuperAdmin: vi.fn(),
  },
  settings: {
    isFeatureEnabled: vi.fn(),
    getAttendanceSettings: vi.fn(),
    isPayrollSubFeatureEnabled: vi.fn(),
  },
}));

vi.mock("../src/modules/approvals/approval-workflow-engine.repository", () => mocks.repository);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permissions);
vi.mock("../src/services/settings.service", () => mocks.settings);

import { resolveApproversForStep } from "../src/modules/approvals/approval-approver-resolver.service";
import * as service from "../src/modules/approvals/approval-workflow-engine.service";
import type { ApprovalRequestEngineRecord, ApprovalRequestStepEngineRecord, ApprovalWorkflowEngineRecord, ApprovalWorkflowStepEngineRecord } from "../src/modules/approvals/approval-workflow-engine.types";
import type { AuthActor } from "../src/types/api.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const env = { DB: { batch: vi.fn() } } as unknown as Env;
const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR Final",
  email: "hr@example.com",
  roles: ["HR"],
  roleKeys: ["hr"],
  permissions: ["approvals.requests.approve", "approvals.requests.reject", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.requests.cancel"],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: true,
  requestId: "req_test",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

const actorWith = (overrides: Partial<AuthActor>): AuthActor => ({
  ...actor,
  ...overrides,
  permissions: overrides.permissions ?? actor.permissions,
});

const workflow = (overrides: Partial<ApprovalWorkflowEngineRecord> = {}): ApprovalWorkflowEngineRecord => ({
  id: "wf_1",
  company_id: "company_1",
  code: "LEAVE_DEFAULT",
  name: "Leave Default",
  description: null,
  operation_type: "LEAVE_REQUEST",
  status: "ACTIVE",
  is_default: 1,
  applies_to_department_id: null,
  applies_to_level_min: null,
  applies_to_level_max: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  archived_at: null,
  ...overrides,
});

const workflowStep = (overrides: Partial<ApprovalWorkflowStepEngineRecord> = {}): ApprovalWorkflowStepEngineRecord => ({
  id: "step_1",
  company_id: "company_1",
  workflow_id: "wf_1",
  step_order: 1,
  step_code: "DEPT",
  step_name: "Department Approval",
  approver_resolver_type: "DEPARTMENT_LEVEL",
  required_permission: "approvals.department.approve",
  required_role_id: null,
  required_department_id: null,
  required_min_level: 3,
  required_max_level: 4,
  specific_user_id: null,
  is_final_step: 0,
  all_approvers_required: 0,
  min_approvals_required: 1,
  allow_self_approval: 0,
  fallback_behavior: "SKIP_TO_HR",
  is_active: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const request = (overrides: Partial<ApprovalRequestEngineRecord> = {}): ApprovalRequestEngineRecord => ({
  id: "approval_req_1",
  company_id: "company_1",
  workflow_id: "wf_1",
  operation_type: "LEAVE_REQUEST",
  subject_type: "leave_request",
  subject_id: "leave_1",
  requester_employee_id: "emp_requester",
  requester_user_id: "user_requester",
  subject_employee_id: "emp_requester",
  department_id: "dept_ops",
  position_id: "pos_staff",
  level: 1,
  title: "Annual leave",
  summary: null,
  payload_json: null,
  status: "DRAFT",
  current_step_id: null,
  submitted_at: null,
  approved_at: null,
  rejected_at: null,
  cancelled_at: null,
  completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const requestStep = (overrides: Partial<ApprovalRequestStepEngineRecord> = {}): ApprovalRequestStepEngineRecord => ({
  id: "req_step_1",
  company_id: "company_1",
  approval_request_id: "approval_req_1",
  workflow_step_id: "step_1",
  step_order: 1,
  step_code: "DEPT",
  step_name: "Department Approval",
  approver_resolver_type: "DEPARTMENT_LEVEL",
  assigned_approver_user_id: null,
  assigned_approver_employee_id: null,
  assigned_department_id: "dept_ops",
  required_permission: "approvals.department.approve",
  required_role_id: null,
  required_min_level: 3,
  required_max_level: 4,
  status: "PENDING",
  fallback_applied: null,
  resolved_at: null,
  due_at: null,
  approved_at: null,
  rejected_at: null,
  skipped_at: null,
  escalated_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
  mocks.permissions.hasPermission.mockImplementation((context: AuthActor, permission: string) => context.permissions.includes(permission));
  mocks.permissions.hasAnyPermission.mockImplementation((context: AuthActor, permissions: string[]) => permissions.some((permission) => context.permissions.includes(permission)));
  mocks.permissions.isSuperAdmin.mockImplementation((context: AuthActor) => context.isSuperAdmin === true || context.roleKeys.includes("super_admin"));
  mocks.settings.isFeatureEnabled.mockResolvedValue(true);
  mocks.settings.getAttendanceSettings.mockResolvedValue({
    "attendance.corrections_enabled": true,
    attendance_correction_enabled: true,
    "attendance.payroll_deductions_enabled": true,
  });
  mocks.settings.isPayrollSubFeatureEnabled.mockResolvedValue(true);
  mocks.repository.findWorkflowStepById.mockResolvedValue(workflowStep());
  mocks.repository.findEmployeeByUserId.mockResolvedValue({ employee_id: "emp_hr", full_name: "HR Final", department_id: "dept_hr", position_id: "pos_hr", level: 4, status: "active", archived_at: null, deleted_at: null });
  mocks.repository.listActions.mockResolvedValue([]);
});

describe("general approval workflow engine", () => {
  it("adds migrations, routes, permissions, frontend pages, and verifier hooks", () => {
    const migration = read("migrations/0061_general_approval_workflow_engine.sql");
    const routes = read("src/routes/approvals.routes.ts");
    const permissions = read("seeds/permissions.seed.sql");
    const page = read("frontend/src/features/approvals/ApprovalsPage.tsx");

    expect(migration).toContain("approval_request_steps");
    expect(migration).toContain("idx_approval_request_steps_company_user");
    expect(routes).toContain('approvalsRoutes.get("/requests"');
    expect(routes).toContain('approvalsRoutes.get("/my-pending"');
    expect(routes).toContain('approvalsRoutes.post("/requests/:id/approve"');
    expect(routes).toContain('approvalsRoutes.get("/requests/:id/timeline"');
    expect(routes).toContain("approvals.department.view");
    expect(routes).toContain("approvals.hrFinal.approve");
    expect(routes).toContain("approvals.financeFinal.reject");
    expect(permissions).toContain("approvals.workflows.manage");
    expect(permissions).toContain("approvals.requests.createForOthers");
    expect(permissions).toContain("approvals.requests.cancelAny");
    expect(permissions).toContain("approvals.hrFinal.approve");
    expect(page).toContain("Approval Requests");
    expect(page).toContain("My Pending");
    expect(page).not.toMatch(/window\.alert|window\.confirm/);
  });

  it("creates workflow and rejects duplicate workflow code", async () => {
    mocks.repository.findWorkflowByCode.mockResolvedValueOnce(null);
    mocks.repository.findWorkflowById.mockResolvedValue(workflow());

    await expect(service.createWorkflow(env, actor, {
      code: "LEAVE_DEFAULT",
      name: "Leave Default",
      operation_type: "LEAVE_REQUEST",
      status: "ACTIVE",
      is_default: true,
    })).resolves.toMatchObject({ id: "wf_1" });
    expect(mocks.repository.createWorkflow).toHaveBeenCalled();
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "approval_workflow_created" }));

    mocks.repository.findWorkflowByCode.mockResolvedValueOnce(workflow());
    await expect(service.createWorkflow(env, actor, {
      code: "LEAVE_DEFAULT",
      name: "Duplicate",
      operation_type: "LEAVE_REQUEST",
    })).rejects.toThrow(/already exists/);
  });

  it("creates workflow steps and rejects invalid resolver, invalid level range, and duplicate order", async () => {
    mocks.repository.findWorkflowById.mockResolvedValue(workflow());
    mocks.repository.findStepByOrder.mockResolvedValueOnce(null);
    mocks.repository.findWorkflowStepById.mockResolvedValue(workflowStep());

    await expect(service.createWorkflowStep(env, actor, "wf_1", {
      step_order: 1,
      step_name: "Department Approval",
      approver_resolver_type: "DEPARTMENT_LEVEL",
      required_min_level: 3,
      required_max_level: 4,
    })).resolves.toMatchObject({ id: "step_1" });
    expect(mocks.repository.createWorkflowStep).toHaveBeenCalled();

    await expect(service.createWorkflowStep(env, actor, "wf_1", {
      step_order: 2,
      step_name: "Bad",
      approver_resolver_type: "NOPE" as never,
    })).rejects.toThrow(/Approver resolver/);
    await expect(service.createWorkflowStep(env, actor, "wf_1", {
      step_order: 2,
      step_name: "Bad levels",
      approver_resolver_type: "DEPARTMENT_LEVEL",
      required_min_level: 4,
      required_max_level: 2,
    })).rejects.toThrow(/Minimum level cannot exceed/);

    mocks.repository.findStepByOrder.mockResolvedValueOnce({ id: "existing" });
    await expect(service.createWorkflowStep(env, actor, "wf_1", {
      step_order: 1,
      step_name: "Duplicate",
      approver_resolver_type: "DEPARTMENT_LEVEL",
    })).rejects.toThrow();
  });

  it("resolves department head, department level, HR final, and excludes requester self approval by default", async () => {
    mocks.repository.findDepartmentHeadApprover.mockResolvedValueOnce([{ user_id: "user_head", employee_id: "emp_head", full_name: "Head", employee_name: "Head", level: 4, department_id: "dept_ops" }]);
    await expect(resolveApproversForStep(env, request(), workflowStep({ approver_resolver_type: "DEPARTMENT_HEAD" }))).resolves.toMatchObject({ status: "RESOLVED", assignedApprover: expect.objectContaining({ user_id: "user_head" }) });

    mocks.repository.findDepartmentLevelApprovers.mockResolvedValueOnce([
      { user_id: "user_requester", employee_id: "emp_requester", full_name: "Self", employee_name: "Self", level: 4, department_id: "dept_ops" },
      { user_id: "user_supervisor", employee_id: "emp_supervisor", full_name: "Supervisor", employee_name: "Supervisor", level: 3, department_id: "dept_ops" },
    ]);
    await expect(resolveApproversForStep(env, request(), workflowStep())).resolves.toMatchObject({ assignedApprover: expect.objectContaining({ user_id: "user_supervisor" }) });

    mocks.repository.findPermissionApprovers.mockResolvedValueOnce([{ user_id: "user_hr", employee_id: "emp_hr", full_name: "HR", employee_name: "HR", level: 4, department_id: "dept_hr" }]);
    await expect(resolveApproversForStep(env, request(), workflowStep({ approver_resolver_type: "HR_FINAL_APPROVER", required_permission: "approvals.hrFinal.approve" }))).resolves.toMatchObject({ status: "RESOLVED" });
  });

  it("skips department step to HR when no approver exists and fallback is SKIP_TO_HR", async () => {
    mocks.repository.findDepartmentLevelApprovers.mockResolvedValueOnce([]);
    await expect(resolveApproversForStep(env, request(), workflowStep({ fallback_behavior: "SKIP_TO_HR" }))).resolves.toMatchObject({
      status: "SKIPPED",
      fallbackApplied: "SKIP_TO_HR",
    });
  });

  it("creates draft request, submits snapshots, and sets first pending step", async () => {
    mocks.repository.findWorkflowForOperation.mockResolvedValue(workflow());
    mocks.repository.findEmployeeForApproval.mockResolvedValue({ employee_id: "emp_hr", full_name: "HR Final", department_id: "dept_hr", position_id: "pos_hr", level: 4, status: "active", archived_at: null, deleted_at: null });
    mocks.repository.findRequestById
      .mockResolvedValueOnce(request())
      .mockResolvedValueOnce(request())
      .mockResolvedValue(request({ status: "IN_REVIEW", current_step_id: "req_step_1" }));
    mocks.repository.listWorkflowSteps.mockResolvedValue([workflowStep(), workflowStep({ id: "step_2", step_order: 2, step_code: "HR", step_name: "HR Final", approver_resolver_type: "HR_FINAL_APPROVER", required_permission: "approvals.hrFinal.approve", is_final_step: 1 })]);
    mocks.repository.findDepartmentLevelApprovers.mockResolvedValue([{ user_id: "user_supervisor", employee_id: "emp_supervisor", full_name: "Supervisor", employee_name: "Supervisor", level: 3, department_id: "dept_ops" }]);
    mocks.repository.findPermissionApprovers.mockResolvedValue([{ user_id: "user_hr", employee_id: "emp_hr", full_name: "HR", employee_name: "HR", level: 4, department_id: "dept_hr" }]);
    mocks.repository.listRequestSteps.mockResolvedValue([
      { ...workflowStep(), id: "req_step_1", approval_request_id: "approval_req_1", workflow_step_id: "step_1", status: "PENDING", assigned_approver_user_id: "user_supervisor", assigned_approver_employee_id: "emp_supervisor", assigned_department_id: "dept_ops", fallback_applied: null, resolved_at: null, due_at: null, approved_at: null, rejected_at: null, skipped_at: null, escalated_at: null },
    ]);

    await service.createApprovalRequestDraft(env, actor, {
      operation_type: "LEAVE_REQUEST",
      subject_type: "leave_request",
      subject_id: "leave_1",
      title: "Annual leave",
      department_id: "dept_ops",
      level: 1,
    });
    await expect(service.submitApprovalRequest(env, actorWith({ permissions: [...actor.permissions, "approvals.requests.createForOthers"] }), "approval_req_1")).resolves.toMatchObject({ status: "IN_REVIEW" });
    expect(mocks.repository.createRequestStep).toHaveBeenCalledTimes(2);
    expect(mocks.repository.updateRequestStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "approval_req_1", expect.objectContaining({ currentStepId: "req_step_1" }));
  });

  it("enforces submit ownership for requester user, requester employee, create-for-others, and Super Admin", async () => {
    const draft = request({ status: "DRAFT", requester_user_id: "user_requester", requester_employee_id: "emp_requester" });

    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), draft))
      .resolves.toBe(true);

    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_requester", full_name: "Requester", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });
    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_employee_owner", permissions: ["approvals.requests.create"] }), draft))
      .resolves.toBe(true);

    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_other", full_name: "Other", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });
    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_other", permissions: ["approvals.requests.create"] }), draft))
      .rejects.toThrow(/another employee/);

    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_requester", full_name: "Requester", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "inactive", archived_at: null, deleted_at: null });
    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_disabled_employee", permissions: ["approvals.requests.create"] }), draft))
      .rejects.toThrow(/another employee/);

    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.createForOthers"] }), draft))
      .resolves.toBe(true);
    await expect(service.canSubmitApprovalRequest(env, actorWith({ actorUserId: "user_super_admin", isSuperAdmin: true, roleKeys: ["super_admin"], permissions: [] }), draft))
      .resolves.toBe(true);

    mocks.repository.findRequestById.mockResolvedValueOnce(draft);
    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_other", full_name: "Other", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });
    await expect(service.submitApprovalRequest(env, actorWith({ actorUserId: "user_other", permissions: ["approvals.requests.create"] }), "approval_req_1"))
      .rejects.toThrow(/another employee/);
    expect(mocks.repository.listWorkflowSteps).not.toHaveBeenCalled();
  });

  it("approves current step, rejects with reason requirement, and blocks requester self approval", async () => {
    const pendingStep = {
      ...workflowStep(),
      id: "req_step_1",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_1",
      status: "PENDING",
      assigned_approver_user_id: "user_hr",
      assigned_approver_employee_id: "emp_hr",
      assigned_department_id: "dept_ops",
      fallback_applied: null,
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    };
    mocks.repository.findRequestById.mockResolvedValue(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", current_step_id: "req_step_1", requester_user_id: "user_requester" }));
    mocks.repository.listRequestSteps.mockResolvedValue([pendingStep]);

    await expect(service.approveStep(env, actor, "approval_req_1")).resolves.toBeTruthy();
    expect(mocks.repository.updateRequestStepStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "req_step_1", expect.objectContaining({ status: "APPROVED" }));
    await expect(service.rejectStep(env, actor, "approval_req_1", "")).rejects.toThrow(/rejection reason/);

    mocks.repository.findRequestById.mockResolvedValue(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", current_step_id: "req_step_1", requester_user_id: "user_hr" }));
    await expect(service.approveStep(env, actor, "approval_req_1")).rejects.toThrow(/cannot approve your own request/);

    mocks.repository.findRequestById.mockResolvedValue(request({ operation_type: "ATTENDANCE_CORRECTION", subject_type: "ATTENDANCE_CORRECTION", subject_id: "att_corr_1", status: "IN_REVIEW", current_step_id: "req_step_1", requester_user_id: "user_requester" }));
    mocks.repository.listRequestSteps.mockResolvedValue([pendingStep]);
    await expect(service.approveStep(env, actor, "approval_req_1")).rejects.toThrow(/Attendance corrections must be approved from the Attendance module/);
    await expect(service.approveStep(env, actor, "approval_req_1", "Module action", { allowModuleBoundAction: true })).resolves.toBeTruthy();
  });

  it("allows department, HR, and finance approvers with step-specific permissions without broad approval permission", async () => {
    const deptActor = actorWith({ actorUserId: "user_dept", permissions: ["approvals.department.approve"], roleKeys: ["supervisor"] });
    const hrActor = actorWith({ actorUserId: "user_hr_final", permissions: ["approvals.hrFinal.approve"], roleKeys: ["hr"] });
    const financeActor = actorWith({ actorUserId: "user_finance", permissions: ["approvals.financeFinal.approve"], roleKeys: ["finance"] });
    const baseRequest = request({ requester_user_id: "user_requester" });

    await expect(service.canActOnApprovalStep(env, deptActor, baseRequest, {
      ...workflowStep(),
      id: "req_step_dept",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_1",
      status: "PENDING",
      assigned_approver_user_id: "user_dept",
      assigned_approver_employee_id: "emp_dept",
      assigned_department_id: "dept_ops",
      fallback_applied: null,
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    }, "approve")).resolves.toBe(true);

    await expect(service.canActOnApprovalStep(env, hrActor, baseRequest, {
      ...workflowStep({ approver_resolver_type: "HR_FINAL_APPROVER", required_permission: "approvals.hrFinal.approve" }),
      id: "req_step_hr",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_hr",
      status: "PENDING",
      assigned_approver_user_id: "user_hr_final",
      assigned_approver_employee_id: "emp_hr",
      assigned_department_id: "dept_hr",
      fallback_applied: null,
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    }, "approve")).resolves.toBe(true);

    await expect(service.canActOnApprovalStep(env, financeActor, baseRequest, {
      ...workflowStep({ approver_resolver_type: "FINANCE_FINAL_APPROVER", required_permission: "approvals.financeFinal.approve" }),
      id: "req_step_fin",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_fin",
      status: "PENDING",
      assigned_approver_user_id: "user_finance",
      assigned_approver_employee_id: "emp_finance",
      assigned_department_id: "dept_finance",
      fallback_applied: null,
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    }, "approve")).resolves.toBe(true);

    await expect(service.canActOnApprovalStep(env, actorWith({ actorUserId: "user_weak", permissions: [] }), baseRequest, {
      ...workflowStep(),
      id: "req_step_dept",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_1",
      status: "PENDING",
      assigned_approver_user_id: "user_weak",
      assigned_approver_employee_id: "emp_weak",
      assigned_department_id: "dept_ops",
      fallback_applied: null,
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    }, "approve")).rejects.toThrow(/permission/);
  });

  it("blocks requester employee self-approval for admin-created on-behalf requests unless explicitly allowed", async () => {
    const requesterEmployee = {
      employee_id: "emp_requester",
      full_name: "Requester Employee",
      department_id: "dept_ops",
      position_id: "pos_supervisor",
      level: 4,
      status: "active",
      archived_at: null,
      deleted_at: null,
    };
    const onBehalfRequest = request({
      requester_user_id: "user_admin",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_requester",
      department_id: "dept_ops",
    });
    const requesterActor = actorWith({
      actorUserId: "user_requester_employee",
      permissions: ["approvals.department.approve", "approvals.department.reject"],
      roleKeys: ["department_manager"],
    });

    mocks.repository.findEmployeeByUserId.mockImplementation(async (_env: Env, _companyId: string, userId: string) =>
      userId === "user_requester_employee"
        ? requesterEmployee
        : { employee_id: "emp_manager", full_name: "Manager", department_id: "dept_ops", position_id: "pos_manager", level: 4, status: "active", archived_at: null, deleted_at: null });
    await expect(service.canActOnApprovalStep(env, requesterActor, onBehalfRequest, requestStep(), "approve"))
      .rejects.toThrow(/cannot approve your own request/);
    await expect(service.canActOnApprovalStep(env, requesterActor, onBehalfRequest, requestStep(), "reject"))
      .rejects.toThrow(/cannot approve your own request/);

    await expect(service.canActOnApprovalStep(env, actorWith({
      actorUserId: "user_manager",
      permissions: ["approvals.department.approve"],
      roleKeys: ["department_manager"],
    }), onBehalfRequest, requestStep({
      assigned_approver_user_id: "user_requester_employee",
      assigned_approver_employee_id: null,
    }), "approve")).rejects.toThrow(/cannot approve your own request/);

    await expect(service.canActOnApprovalStep(env, actorWith({
      actorUserId: "user_super_admin",
      isSuperAdmin: true,
      roleKeys: ["super_admin"],
      permissions: ["approvals.requests.approve"],
    }), request({ requester_user_id: "user_super_admin", requester_employee_id: "emp_super_admin" }), requestStep({
      assigned_approver_user_id: "user_super_admin",
      assigned_approver_employee_id: "emp_super_admin",
    }), "approve")).rejects.toThrow(/cannot approve your own request/);

    mocks.repository.findWorkflowStepById.mockResolvedValueOnce(workflowStep({ allow_self_approval: 1 }));
    await expect(service.canActOnApprovalStep(env, requesterActor, onBehalfRequest, requestStep(), "approve"))
      .resolves.toBe(true);
  });

  it("builds row-level visibility filters for employees, department approvers, HR, finance, and super admin", async () => {
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ employee_id: "emp_dept", full_name: "Supervisor", department_id: "dept_ops", position_id: "pos_sup", level: 3, status: "active", archived_at: null, deleted_at: null });

    const employeeVisibility = await service.buildApprovalRequestVisibilityFilter(env, actorWith({ actorUserId: "user_employee", permissions: [] }));
    expect(employeeVisibility.extra).toContain("r.requester_user_id = ?");
    expect(employeeVisibility.values).toContain("user_employee");

    const deptVisibility = await service.buildApprovalRequestVisibilityFilter(env, actorWith({ actorUserId: "user_dept", permissions: ["approvals.department.approve"] }));
    expect(deptVisibility.extra).toContain("DEPARTMENT_LEVEL");
    expect(deptVisibility.values).toContain("dept_ops");

    const hrVisibility = await service.buildApprovalRequestVisibilityFilter(env, actorWith({ actorUserId: "user_hr_final", permissions: ["approvals.hrFinal.approve"] }));
    expect(hrVisibility.extra).toContain("HR_FINAL_APPROVER");

    const financeVisibility = await service.buildApprovalRequestVisibilityFilter(env, actorWith({ actorUserId: "user_finance", permissions: ["approvals.financeFinal.approve"] }));
    expect(financeVisibility.extra).toContain("FINANCE_FINAL_APPROVER");

    mocks.permissions.isSuperAdmin.mockReturnValueOnce(true);
    const superAdminVisibility = await service.buildApprovalRequestVisibilityFilter(env, actorWith({ isSuperAdmin: true, roleKeys: ["super_admin"] }));
    expect(superAdminVisibility.extra).toBeUndefined();
  });

  it("scopes approval timelines for department, HR, finance, own-request, and unrelated employees", async () => {
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ employee_id: "emp_dept", full_name: "Department Viewer", department_id: "dept_ops", position_id: "pos_sup", level: 3, status: "active", archived_at: null, deleted_at: null });
    mocks.repository.findRequestById.mockResolvedValueOnce(request({ department_id: "dept_ops" }));
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep({ assigned_department_id: "dept_ops" })]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_dept_view", permissions: ["approvals.department.view"] }), "approval_req_1"))
      .resolves.toMatchObject({ request: expect.objectContaining({ department_id: "dept_ops" }) });

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ department_id: "dept_finance" }));
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep({ assigned_department_id: "dept_finance" })]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_dept_view", permissions: ["approvals.department.view"] }), "approval_req_1"))
      .rejects.toThrow(/access/);

    mocks.repository.findRequestById.mockResolvedValueOnce(request());
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep({ approver_resolver_type: "HR_FINAL_APPROVER", required_permission: "approvals.hrFinal.approve", assigned_department_id: "dept_hr" })]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_hr_final", permissions: ["approvals.hrFinal.view"] }), "approval_req_1"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request());
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep({ approver_resolver_type: "FINANCE_FINAL_APPROVER", required_permission: "approvals.financeFinal.approve", assigned_department_id: "dept_finance" })]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_finance_final", permissions: ["approvals.financeFinal.approve"] }), "approval_req_1"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ requester_user_id: "user_employee" }));
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep()]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_employee", permissions: [] }), "approval_req_1"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ requester_user_id: "user_other" }));
    mocks.repository.listRequestSteps.mockResolvedValueOnce([requestStep()]);
    await expect(service.getTimeline(env, actorWith({ actorUserId: "user_employee", permissions: [] }), "approval_req_1"))
      .rejects.toThrow(/access/);
  });

  it("derives requester and subject structure, blocks subject spoofing, and allows explicit create-for-others", async () => {
    mocks.repository.findWorkflowForOperation.mockResolvedValue(workflow());
    mocks.repository.findRequestById.mockResolvedValue(request());
    const requester = { employee_id: "emp_requester", full_name: "Requester", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null };
    const subject = { employee_id: "emp_subject", full_name: "Subject", department_id: "dept_hr", position_id: "pos_subject", level: 2, status: "active", archived_at: null, deleted_at: null };
    mocks.repository.findEmployeeByUserId.mockImplementation(async (_env: Env, _companyId: string, userId: string) =>
      userId === "user_requester" ? requester : { employee_id: "emp_hr", full_name: "HR", department_id: "dept_hr", position_id: "pos_hr", level: 4, status: "active", archived_at: null, deleted_at: null });
    mocks.repository.findEmployeeForApproval.mockImplementation(async (_env: Env, _companyId: string, employeeId: string) =>
      employeeId === "emp_requester" ? requester : employeeId === "emp_subject" ? subject : null);

    await service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_1",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_requester",
      department_id: "spoofed_dept",
      position_id: "spoofed_pos",
      level: 4,
      title: "Generic request",
      payload_json: { safe: true },
    });

    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "user_requester", "wf_1", expect.objectContaining({
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_requester",
      department_id: "dept_ops",
      position_id: "pos_staff",
      level: 1,
    }));

    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_other_subject",
      subject_employee_id: "emp_subject",
      title: "Other subject",
    })).rejects.toThrow(/another employee/);

    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_2",
      requester_employee_id: "emp_other",
      title: "Spoofed request",
    })).rejects.toThrow(/on behalf/);

    mocks.repository.createRequest.mockClear();
    await service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "approvals.requests.createForOthers"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_hr",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "spoofed_dept",
      position_id: "spoofed_pos",
      level: 4,
      title: "HR on behalf request",
    });
    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "user_hr", "wf_1", expect.objectContaining({
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "dept_hr",
      position_id: "pos_subject",
      level: 2,
    }));

    mocks.repository.createRequest.mockClear();
    await service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "leave.requests.create_for_employee"] }), {
      operation_type: "LEAVE_REQUEST",
      subject_type: "LEAVE_REQUEST",
      subject_id: "leave_req_1",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "spoofed_dept",
      position_id: "spoofed_pos",
      level: 4,
      title: "Leave on behalf request",
      payload_json: { leave_request_id: "leave_req_1" },
    }, {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "leave.requests.create_for_employee",
      moduleOperationType: "LEAVE_REQUEST",
    });
    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "user_hr", "wf_1", expect.objectContaining({
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "dept_hr",
      position_id: "pos_subject",
      level: 2,
    }));

    mocks.repository.createRequest.mockClear();
    await service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "attendance.corrections.createForOthers"] }), {
      operation_type: "ATTENDANCE_CORRECTION",
      subject_type: "ATTENDANCE_CORRECTION",
      subject_id: "att_corr_1",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "spoofed_dept",
      position_id: "spoofed_pos",
      level: 4,
      title: "Attendance correction on behalf request",
      payload_json: { correction_id: "att_corr_1" },
    }, {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "attendance.corrections.createForOthers",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    });
    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "user_hr", "wf_1", expect.objectContaining({
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "dept_hr",
      position_id: "pos_subject",
      level: 2,
    }));

    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "attendance.corrections.createForOthers"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_attendance_misuse",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      title: "Generic attendance misuse",
    }, {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "attendance.corrections.createForOthers",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    })).rejects.toThrow(/another employee/);

    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "leave.requests.create_for_employee"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_module_bound_misuse",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      title: "Generic misuse",
    }, {
      allowModuleBoundCreateForOthers: true,
      modulePermission: "leave.requests.create_for_employee",
      moduleOperationType: "LEAVE_REQUEST",
    })).rejects.toThrow(/another employee/);

    mocks.repository.createRequest.mockClear();
    await service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_super_admin", isSuperAdmin: true, roleKeys: ["super_admin"], permissions: ["approvals.requests.create"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_super_admin",
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      title: "Super Admin on behalf request",
    });
    expect(mocks.repository.createRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "user_super_admin", "wf_1", expect.objectContaining({
      requester_employee_id: "emp_requester",
      subject_employee_id: "emp_subject",
      department_id: "dept_hr",
      position_id: "pos_subject",
      level: 2,
    }));
  });

  it("rejects sensitive approval payload keys and cross-company subjects", async () => {
    mocks.repository.findWorkflowForOperation.mockResolvedValue(workflow());
    mocks.repository.findRequestById.mockResolvedValue(request());
    mocks.repository.findEmployeeByUserId.mockResolvedValue({ employee_id: "emp_requester", full_name: "Requester", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });

    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_3",
      title: "Secret request",
      payload_json: { nested: { reset_token: "unsafe" } },
    })).rejects.toThrow(/Sensitive field/);

    mocks.repository.findEmployeeForApproval.mockResolvedValueOnce(null);
    await expect(service.createApprovalRequestDraft(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.create", "approvals.requests.createForOthers"] }), {
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      subject_id: "generic_4",
      subject_employee_id: "emp_cross_company",
      title: "Cross-company subject",
    })).rejects.toThrow(/active employee/);
  });

  it("validates assignee eligibility, permission, self-approval, and writes action/audit for valid assignment", async () => {
    const pendingStep = {
      ...workflowStep(),
      id: "req_step_1",
      approval_request_id: "approval_req_1",
      workflow_step_id: "step_1",
      status: "WAITING_FOR_APPROVER",
      assigned_approver_user_id: null,
      assigned_approver_employee_id: null,
      assigned_department_id: "dept_ops",
      fallback_applied: "HOLD_FOR_MANUAL_ASSIGNMENT",
      resolved_at: null,
      due_at: null,
      approved_at: null,
      rejected_at: null,
      skipped_at: null,
      escalated_at: null,
    };
    mocks.repository.findRequestById.mockResolvedValue(request({ status: "NEEDS_MANUAL_ASSIGNMENT", current_step_id: "req_step_1", requester_user_id: "user_requester" }));
    mocks.repository.findRequestStepById.mockResolvedValue(pendingStep);
    mocks.repository.findAssignableApprover.mockResolvedValueOnce(null);

    await expect(service.assignApprover(env, actorWith({ permissions: ["approvals.requests.assign"] }), "approval_req_1", "req_step_1", "user_bad", "Manual assignment")).rejects.toThrow(/not eligible/);

    mocks.repository.findAssignableApprover.mockResolvedValueOnce({ user_id: "user_requester", employee_id: "emp_requester", full_name: "Requester", employee_name: "Requester", level: 3, department_id: "dept_ops" });
    await expect(service.assignApprover(env, actorWith({ permissions: ["approvals.requests.assign"] }), "approval_req_1", "req_step_1", "user_requester", "Manual assignment")).rejects.toThrow(/requester cannot be assigned/i);

    await expect(service.assignApprover(env, actorWith({
      actorUserId: "user_super_admin",
      isSuperAdmin: true,
      roleKeys: ["super_admin"],
      permissions: ["approvals.requests.assign"],
    }), "approval_req_1", "req_step_1", "user_requester", "Manual assignment")).rejects.toThrow(/requester cannot be assigned/i);

    mocks.repository.findAssignableApprover.mockReset();
    mocks.repository.findWorkflowStepById.mockResolvedValueOnce(workflowStep({ allow_self_approval: 1 }));
    mocks.repository.findAssignableApprover.mockResolvedValueOnce({ user_id: "user_requester", employee_id: "emp_requester", full_name: "Requester", employee_name: "Requester", level: 3, department_id: "dept_ops" });
    await expect(service.assignApprover(env, actorWith({ permissions: ["approvals.requests.assign"] }), "approval_req_1", "req_step_1", "user_requester", "Self approval exception")).resolves.toBeTruthy();

    mocks.repository.findAssignableApprover.mockReset();
    mocks.repository.findAssignableApprover.mockResolvedValueOnce({ user_id: "user_supervisor", employee_id: "emp_supervisor", full_name: "Supervisor", employee_name: "Supervisor", level: 3, department_id: "dept_ops" });
    await expect(service.assignApprover(env, actorWith({ permissions: ["approvals.requests.assign"] }), "approval_req_1", "req_step_1", "user_supervisor", "Manual assignment")).resolves.toBeTruthy();
    expect(mocks.repository.updateRequestStepStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "req_step_1", expect.objectContaining({ assignedUserId: "user_supervisor" }));
    expect(mocks.repository.createAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "ASSIGN_APPROVER", reason: "Manual assignment" }));
    expect(mocks.audit.createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "approval_step_assigned" }));
  });

  it("enforces cancel ownership, cancelAny, reason requirement, and terminal status protection", async () => {
    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_requester", requester_employee_id: "emp_requester" }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.cancel"] }), "approval_req_1"))
      .resolves.toBeTruthy();
    expect(mocks.repository.updateRequestStatus).toHaveBeenCalledWith(expect.anything(), "company_1", "approval_req_1", expect.objectContaining({ status: "CANCELLED" }));
    expect(mocks.repository.createAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "CANCEL" }));

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_admin", requester_employee_id: "emp_requester" }));
    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_requester", full_name: "Requester", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_employee_owner", permissions: ["approvals.requests.cancel"] }), "approval_req_1"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_other", requester_employee_id: "emp_other" }));
    mocks.repository.findEmployeeByUserId.mockResolvedValueOnce({ employee_id: "emp_current", full_name: "Current", department_id: "dept_ops", position_id: "pos_staff", level: 1, status: "active", archived_at: null, deleted_at: null });
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_current", permissions: ["approvals.requests.cancel"] }), "approval_req_1"))
      .rejects.toThrow(/cannot cancel/);

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_other", requester_employee_id: "emp_other" }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.cancelAny"] }), "approval_req_1"))
      .rejects.toThrow(/reason is required/);

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_other", requester_employee_id: "emp_other" }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_hr", permissions: ["approvals.requests.cancelAny"] }), "approval_req_1", "Duplicate request"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ operation_type: "GENERIC_REQUEST", subject_type: "generic", status: "IN_REVIEW", requester_user_id: "user_other", requester_employee_id: "emp_other" }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_super_admin", isSuperAdmin: true, roleKeys: ["super_admin"], permissions: [] }), "approval_req_1", "Admin cleanup"))
      .resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({ status: "APPROVED", requester_user_id: "user_requester" }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.cancel"] }), "approval_req_1"))
      .rejects.toThrow(/already completed/);
  });

  it("allows attendance module-bound own cancellation without broad approval cancel permission only for attendance corrections", async () => {
    mocks.repository.findRequestById.mockResolvedValueOnce(request({
      operation_type: "ATTENDANCE_CORRECTION",
      subject_type: "ATTENDANCE_CORRECTION",
      status: "IN_REVIEW",
      requester_user_id: "user_requester",
      requester_employee_id: "emp_requester",
    }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_requester", permissions: ["attendance.corrections.cancel"] }), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "attendance.corrections.cancel",
      moduleCancelAnyPermission: "attendance.corrections.cancelAny",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    })).resolves.toBeTruthy();

    mocks.repository.findRequestById.mockResolvedValueOnce(request({
      operation_type: "GENERIC_REQUEST",
      subject_type: "generic",
      status: "IN_REVIEW",
      requester_user_id: "user_requester",
      requester_employee_id: "emp_requester",
    }));
    await expect(service.cancelRequest(env, actorWith({ actorUserId: "user_requester", permissions: ["attendance.corrections.cancel"] }), "approval_req_1", "No longer needed", {
      allowModuleBoundAction: true,
      moduleCancelPermission: "attendance.corrections.cancel",
      moduleCancelAnyPermission: "attendance.corrections.cancelAny",
      moduleOperationType: "ATTENDANCE_CORRECTION",
    })).rejects.toThrow(/cannot cancel/);
  });

  it("keeps fallback safe when department approver is missing and final approver is unavailable", async () => {
    mocks.repository.findRequestById.mockResolvedValueOnce(request()).mockResolvedValue(request({ status: "IN_REVIEW", current_step_id: "req_step_hr" }));
    mocks.repository.listWorkflowSteps.mockResolvedValue([
      workflowStep({ id: "step_dept", step_order: 1, step_code: "DEPT", fallback_behavior: "SKIP_TO_HR" }),
      workflowStep({ id: "step_hr", step_order: 2, step_code: "HR", step_name: "HR Final", approver_resolver_type: "HR_FINAL_APPROVER", required_permission: "approvals.hrFinal.approve", fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT", is_final_step: 1 }),
    ]);
    mocks.repository.findDepartmentLevelApprovers.mockResolvedValue([]);
    mocks.repository.findPermissionApprovers.mockResolvedValue([]);
    mocks.repository.listRequestSteps.mockResolvedValue([
      { ...workflowStep(), id: "req_step_dept", approval_request_id: "approval_req_1", workflow_step_id: "step_dept", status: "SKIPPED", assigned_approver_user_id: null, assigned_approver_employee_id: null, assigned_department_id: "dept_ops", fallback_applied: "SKIP_TO_HR", resolved_at: null, due_at: null, approved_at: null, rejected_at: null, skipped_at: "2026-01-01T00:00:00.000Z", escalated_at: null },
      { ...workflowStep({ approver_resolver_type: "HR_FINAL_APPROVER" }), id: "req_step_hr", approval_request_id: "approval_req_1", workflow_step_id: "step_hr", status: "WAITING_FOR_APPROVER", assigned_approver_user_id: null, assigned_approver_employee_id: null, assigned_department_id: null, fallback_applied: "HOLD_FOR_MANUAL_ASSIGNMENT", resolved_at: null, due_at: null, approved_at: null, rejected_at: null, skipped_at: null, escalated_at: null },
    ]);

    await expect(service.submitApprovalRequest(env, actorWith({ permissions: [...actor.permissions, "approvals.requests.createForOthers"] }), "approval_req_1")).resolves.toBeTruthy();
    expect(mocks.repository.createRequestStep).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "approval_req_1", expect.objectContaining({ step_code: "DEPT" }), expect.objectContaining({ status: "SKIPPED", fallbackApplied: "SKIP_TO_HR" }));
    expect(mocks.repository.createRequestStep).toHaveBeenCalledWith(expect.anything(), expect.anything(), "company_1", "approval_req_1", expect.objectContaining({ step_code: "HR" }), expect.objectContaining({ status: "WAITING_FOR_APPROVER", fallbackApplied: "HOLD_FOR_MANUAL_ASSIGNMENT" }));

    mocks.repository.findRequestById.mockResolvedValueOnce(request());
    mocks.repository.listWorkflowSteps.mockResolvedValueOnce([workflowStep({ approver_resolver_type: "HR_FINAL_APPROVER", is_final_step: 1, fallback_behavior: "SKIP_TO_HR" })]);
    mocks.repository.findPermissionApprovers.mockResolvedValueOnce([]);
    await expect(service.submitApprovalRequest(env, actorWith({ permissions: [...actor.permissions, "approvals.requests.createForOthers"] }), "approval_req_1")).rejects.toThrow(/Final approval steps cannot be skipped/);
  });

  it("keeps approval payload and audit checks away from auth secrets", () => {
    const serviceText = read("src/modules/approvals/approval-workflow-engine.service.ts");
    const repositoryText = read("src/modules/approvals/approval-workflow-engine.repository.ts");
    expect(serviceText).toContain("sensitivePayloadKeys");
    expect(serviceText).toContain("password_hash");
    expect(serviceText).toContain("reset_token");
    expect(repositoryText).not.toMatch(/password_hash|session_token|totp_secret|reset_token/);
  });

  it("blocks approval request creation when the related module or sub-feature is disabled", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "leave_management");
    await expect(service.createApprovalRequestDraft(env, actorWith({ permissions: ["approvals.requests.create"] }), {
      operation_type: "LEAVE_REQUEST",
      subject_type: "leave_request",
      subject_id: "leave_disabled",
      title: "Leave disabled",
    })).rejects.toThrow(/Leave Management is disabled/);
    expect(mocks.repository.createRequest).not.toHaveBeenCalled();

    mocks.settings.isFeatureEnabled.mockResolvedValue(true);
    mocks.settings.getAttendanceSettings.mockResolvedValue({ "attendance.corrections_enabled": false, attendance_correction_enabled: false });
    await expect(service.createApprovalRequestDraft(env, actorWith({ permissions: ["approvals.requests.create"] }), {
      operation_type: "ATTENDANCE_CORRECTION",
      subject_type: "ATTENDANCE_CORRECTION",
      subject_id: "correction_disabled",
      title: "Correction disabled",
    })).rejects.toThrow(/Attendance Corrections are disabled/);

    mocks.settings.getAttendanceSettings.mockResolvedValue({ "attendance.corrections_enabled": true, attendance_correction_enabled: true });
    mocks.settings.isPayrollSubFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, key: string) => key !== "payroll.approvals_enabled");
    await expect(service.createApprovalRequestDraft(env, actorWith({ permissions: ["approvals.requests.create"] }), {
      operation_type: "PAYROLL_ADJUSTMENT",
      subject_type: "payroll_adjustment",
      subject_id: "adjustment_disabled",
      title: "Payroll approval disabled",
    })).rejects.toThrow(/Payroll manual deductions or payroll approvals are disabled/);
  });

  it("filters active approval queues to enabled modules and preserves own historical requests", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "leave_management");
    mocks.repository.countRequests.mockResolvedValue(0);
    mocks.repository.listRequests.mockResolvedValue([]);

    await service.getMyPending(env, actorWith({ permissions: ["approvals.department.approve"] }), { page: 1, page_size: 25 });
    const pendingExtra = mocks.repository.countRequests.mock.calls.at(-1)?.[3] as string;
    const pendingValues = mocks.repository.countRequests.mock.calls.at(-1)?.[4] as unknown[];
    expect(pendingExtra).toContain("r.operation_type IN");
    expect(pendingValues).not.toContain("LEAVE_REQUEST");

    mocks.repository.listRequests.mockResolvedValueOnce([request({ status: "APPROVED", operation_type: "LEAVE_REQUEST" })]);
    await expect(service.getMyRequests(env, actorWith({ actorUserId: "user_requester", permissions: ["approvals.requests.create"] }), { page: 1, page_size: 25 }))
      .resolves.toMatchObject({ rows: [expect.objectContaining({ operation_type: "LEAVE_REQUEST", module_enabled: false, read_only: false })] });
  });

  it("blocks approval actions for disabled module records without deleting history", async () => {
    mocks.settings.isFeatureEnabled.mockImplementation(async (_env: Env, _companyId: string, feature: string) => feature !== "roster");
    mocks.repository.findRequestById.mockResolvedValue(request({
      operation_type: "ROSTER_CHANGE",
      subject_type: "ROSTER_CHANGE",
      status: "IN_REVIEW",
      current_step_id: "req_step_1",
      requester_user_id: "user_requester",
    }));
    mocks.repository.listRequestSteps.mockResolvedValue([requestStep({ assigned_approver_user_id: "user_hr" })]);

    await expect(service.approveStep(env, actor, "approval_req_1", "Approved", {
      allowModuleBoundAction: true,
      moduleOperationType: "ROSTER_CHANGE",
    })).rejects.toThrow(/Duty Roster is disabled/);
    expect(mocks.repository.updateRequestStepStatus).not.toHaveBeenCalled();
    expect(mocks.repository.createAction).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "APPROVE" }));
  });
});
