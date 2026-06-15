import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import { resolveApproversForStep } from "./approval-approver-resolver.service";
import * as repository from "./approval-workflow-engine.repository";
import {
  APPROVAL_FALLBACK_BEHAVIORS,
  APPROVAL_OPERATION_TYPES,
  APPROVER_RESOLVER_TYPES,
  APPROVAL_WORKFLOW_STATUSES,
  type ApprovalEngineFilters,
  type ApprovalRequestEngineRecord,
  type ApprovalRequestInput,
  type ApprovalRequestStepEngineRecord,
  type ApprovalWorkflowInput,
  type ApprovalWorkflowStepInput,
} from "./approval-workflow-engine.types";

const nowIso = () => new Date().toISOString();
const clampPageSize = (value?: number) => Math.min(Math.max(Number(value) || 25, 1), 100);
const MODULE_BOUND_LEAVE_ACTION_MESSAGE =
  "Leave requests must be approved from the Leave module so leave status and balance are updated safely.";
const MODULE_BOUND_ATTENDANCE_CORRECTION_ACTION_MESSAGE =
  "Attendance corrections must be approved from the Attendance module so attendance records are updated safely.";
const MODULE_BOUND_ROSTER_CHANGE_ACTION_MESSAGE =
  "Roster changes must be approved from the Roster module so roster records are updated safely.";
const MODULE_BOUND_PAYROLL_ADJUSTMENT_ACTION_MESSAGE =
  "Payroll adjustments must be approved from the Payroll module so payroll status and ledger are updated safely.";
const MODULE_BOUND_ADVANCE_SALARY_ACTION_MESSAGE =
  "Advance salary requests must be approved from the Advances module so payment and deduction records are updated safely.";
const MODULE_BOUND_DOCUMENT_KYC_ACTION_MESSAGE =
  "Document/KYC requests must be approved from the Documents module so verification and profile records are updated safely.";
const MODULE_BOUND_EMPLOYEE_STRUCTURE_ACTION_MESSAGE =
  "Employee transfer/structure change requests must be approved from the Employee Structure module so employee structure and history are updated safely.";
const MODULE_BOUND_EMPLOYEE_LIFECYCLE_ACTION_MESSAGE =
  "Resignation and offboarding requests must be approved from the Employee Lifecycle module so employee status, offboarding tasks, login access, and sessions are updated safely.";
const MODULE_BOUND_DISCIPLINARY_ACTION_MESSAGE =
  "Disciplinary actions must be approved from the Disciplinary Actions module so official records, acknowledgements, and follow-up tasks are updated safely.";
type ApprovalEngineActionOptions = {
  allowModuleBoundAction?: boolean;
  moduleCancelPermission?: string;
  moduleCancelAnyPermission?: string;
  moduleOperationType?: string;
};
type ApprovalDraftOptions = {
  allowModuleBoundCreateForOthers?: boolean;
  modulePermission?: string;
  moduleOperationType?: string;
};

export const normalizeFilters = (query: Record<string, string | undefined>): ApprovalEngineFilters => ({
  operation_type: query.operation_type,
  status: query.status,
  department_id: query.department_id,
  search: query.search?.trim() || undefined,
  page: Math.max(Number(query.page) || 1, 1),
  page_size: clampPageSize(query.page_size ? Number(query.page_size) : 25),
});

const pagination = (filters: ApprovalEngineFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const assertAllowedValue = <T extends readonly string[]>(value: string | undefined, allowed: T, field: string) => {
  if (!value || !allowed.includes(value)) throw new ValidationError(`${field} is not valid.`);
};

const assertLevelRange = (min?: number | null, max?: number | null) => {
  if (min !== undefined && min !== null && (min < 1 || min > 4)) throw new ValidationError("Minimum level must be between 1 and 4.");
  if (max !== undefined && max !== null && (max < 1 || max > 4)) throw new ValidationError("Maximum level must be between 1 and 4.");
  if (min !== undefined && min !== null && max !== undefined && max !== null && min > max) {
    throw new ValidationError("Minimum level cannot exceed maximum level.");
  }
};

const requireField = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`${label} is required.`);
};

const sensitivePayloadKeys = new Set([
  "password",
  "password_hash",
  "token",
  "session_token",
  "reset_token",
  "totp_secret",
  "secret",
]);

const assertSafePayload = (value: unknown, path = "payload_json") => {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePayload(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (sensitivePayloadKeys.has(normalized) || normalized.includes("password") || normalized.includes("token") || normalized.includes("secret")) {
      throw new ValidationError(`Sensitive field ${path}.${key} cannot be stored in approval payloads.`);
    }
    assertSafePayload(nested, `${path}.${key}`);
  }
};

const isActiveEmployee = (employee: Awaited<ReturnType<typeof repository.findEmployeeForApproval>>) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted"].includes(employee.status ?? "active"));

const stepPermissionForAction = (step: ApprovalRequestStepEngineRecord, action: "approve" | "reject") => {
  const fallback =
    step.approver_resolver_type === "HR_FINAL_APPROVER" ? `approvals.hrFinal.${action}` :
      step.approver_resolver_type === "FINANCE_FINAL_APPROVER" ? `approvals.financeFinal.${action}` :
        step.approver_resolver_type.startsWith("DEPARTMENT") ? `approvals.department.${action}` :
          `approvals.requests.${action}`;

  if (action === "approve") return step.required_permission ?? fallback;
  if (!step.required_permission) return fallback;
  return step.required_permission.endsWith(".approve")
    ? step.required_permission.replace(/\.approve$/, ".reject")
    : fallback;
};

const hasApprovalActionPermission = (context: AuthActor, step: ApprovalRequestStepEngineRecord, action: "approve" | "reject") =>
  permissionService.hasPermission(context, `approvals.requests.${action}`) ||
  permissionService.hasPermission(context, stepPermissionForAction(step, action));

const stepAllowsSelfApproval = async (env: Env, request: ApprovalRequestEngineRecord, step: ApprovalRequestStepEngineRecord) => {
  const workflowStep = await repository.findWorkflowStepById(env, request.company_id, request.workflow_id, step.workflow_step_id);
  return workflowStep?.allow_self_approval === 1;
};

const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);

const assignedApproverUserMapsToRequesterEmployee = async (
  env: Env,
  request: ApprovalRequestEngineRecord,
  step: ApprovalRequestStepEngineRecord,
) => {
  if (!request.requester_employee_id || !step.assigned_approver_user_id) return false;
  const assignedEmployee = await repository.findEmployeeByUserId(env, request.company_id, step.assigned_approver_user_id);
  return assignedEmployee?.employee_id === request.requester_employee_id;
};

const isDepartmentStep = (step: Pick<ApprovalRequestStepEngineRecord, "approver_resolver_type">) =>
  step.approver_resolver_type === "DEPARTMENT_HEAD" ||
  step.approver_resolver_type === "DEPARTMENT_LEVEL" ||
  step.approver_resolver_type === "DEPARTMENT_ROLE";

const hasDepartmentViewEligibility = async (env: Env, context: AuthActor, request: ApprovalRequestEngineRecord, step: ApprovalRequestStepEngineRecord) => {
  if (!isDepartmentStep(step)) return false;
  const employee = await actorEmployee(env, context);
  if (!employee || !isActiveEmployee(employee)) return false;
  const departmentId = step.assigned_department_id ?? request.department_id;
  if (departmentId && employee.department_id !== departmentId) return false;
  if (step.required_min_level !== null && (employee.level ?? 0) < step.required_min_level) return false;
  if (step.required_max_level !== null && (employee.level ?? 99) > step.required_max_level) return false;
  return permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"]);
};

const hasDepartmentEligibility = async (env: Env, context: AuthActor, request: ApprovalRequestEngineRecord, step: ApprovalRequestStepEngineRecord, action: "approve" | "reject") => {
  if (!await hasDepartmentViewEligibility(env, context, request, step)) return false;
  return hasApprovalActionPermission(context, step, action);
};

export const canActOnApprovalStep = async (
  env: Env,
  context: AuthActor,
  request: ApprovalRequestEngineRecord,
  step: ApprovalRequestStepEngineRecord,
  action: "approve" | "reject",
) => {
  if (!["PENDING", "ESCALATED"].includes(step.status)) {
    throw new ConflictError("This approval step is not waiting for an approver.");
  }
  const allowSelfApproval = await stepAllowsSelfApproval(env, request, step);
  const employee = request.requester_employee_id ? await actorEmployee(env, context) : null;
  const actorIsRequesterEmployee = Boolean(employee?.employee_id && employee.employee_id === request.requester_employee_id);
  const assignedEmployeeIsRequester = Boolean(request.requester_employee_id && step.assigned_approver_employee_id === request.requester_employee_id);
  const assignedUserIsRequesterEmployee = await assignedApproverUserMapsToRequesterEmployee(env, request, step);
  if (!allowSelfApproval && (request.requester_user_id === context.actorUserId || actorIsRequesterEmployee || assignedEmployeeIsRequester || assignedUserIsRequesterEmployee)) {
    throw new PermissionError("You cannot approve your own request.");
  }
  if (permissionService.isSuperAdmin(context)) return true;
  if (step.assigned_approver_user_id && step.assigned_approver_user_id !== context.actorUserId) {
    throw new PermissionError("You are not the assigned approver for this step.");
  }
  if (!hasApprovalActionPermission(context, step, action)) {
    throw new PermissionError();
  }
  if (!step.assigned_approver_user_id && isDepartmentStep(step) && !await hasDepartmentEligibility(env, context, request, step, action)) {
    throw new PermissionError("You are not eligible to act on this department approval step.");
  }
  return true;
};

export const canViewApprovalRequest = async (
  env: Env,
  context: AuthActor,
  request: ApprovalRequestEngineRecord,
  steps: ApprovalRequestStepEngineRecord[],
) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "approvals.requests.view")) return true;
  if (request.requester_user_id === context.actorUserId) return true;
  if (steps.some((step) => step.assigned_approver_user_id === context.actorUserId)) return true;
  if (steps.some((step) => step.approver_resolver_type === "HR_FINAL_APPROVER" && permissionService.hasAnyPermission(context, ["approvals.hrFinal.view", "approvals.hrFinal.approve", "approvals.hrFinal.reject"]))) return true;
  if (steps.some((step) => step.approver_resolver_type === "FINANCE_FINAL_APPROVER" && permissionService.hasAnyPermission(context, ["approvals.financeFinal.view", "approvals.financeFinal.approve", "approvals.financeFinal.reject"]))) return true;
  for (const step of steps) {
    if (await hasDepartmentViewEligibility(env, context, request, step)) return true;
  }
  return false;
};

const actorOwnsRequesterEmployee = async (env: Env, context: AuthActor, request: ApprovalRequestEngineRecord) => {
  if (!request.requester_employee_id) return false;
  const employee = await actorEmployee(env, context);
  return Boolean(employee?.employee_id === request.requester_employee_id && isActiveEmployee(employee));
};

export const canSubmitApprovalRequest = async (env: Env, context: AuthActor, request: ApprovalRequestEngineRecord) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "approvals.requests.createForOthers")) return true;
  if (request.requester_user_id === context.actorUserId) return true;
  if (await actorOwnsRequesterEmployee(env, context, request)) return true;
  throw new PermissionError("You cannot submit another employee's approval request.");
};

const canCancelApprovalRequest = async (env: Env, context: AuthActor, request: ApprovalRequestEngineRecord, reason?: string | null, options?: ApprovalEngineActionOptions) => {
  const isRequesterUser = request.requester_user_id === context.actorUserId;
  const isRequesterEmployee = await actorOwnsRequesterEmployee(env, context, request);
  const moduleBoundCancel =
    options?.allowModuleBoundAction &&
    options.moduleOperationType === request.operation_type &&
    (
      options.moduleCancelPermission === "attendance.corrections.cancel" ||
      options.moduleCancelAnyPermission === "attendance.corrections.cancelAny" ||
      options.moduleCancelPermission === "roster.changes.cancel" ||
      options.moduleCancelAnyPermission === "roster.changes.cancelAny"
      || options.moduleCancelPermission === "payroll.adjustments.cancel"
      || options.moduleCancelAnyPermission === "payroll.adjustments.cancelAny"
      || options.moduleCancelPermission === "advanceSalary.requests.cancel"
      || options.moduleCancelAnyPermission === "advanceSalary.requests.cancelAny"
      || options.moduleCancelPermission === "documentKyc.requests.cancel"
      || options.moduleCancelAnyPermission === "documentKyc.requests.cancelAny"
      || options.moduleCancelPermission === "employees.structureRequests.cancel"
      || options.moduleCancelAnyPermission === "employees.structureRequests.cancelAny"
      || options.moduleCancelPermission === "employeeLifecycle.resignations.cancel"
      || options.moduleCancelAnyPermission === "employeeLifecycle.resignations.cancelAny"
      || options.moduleCancelPermission === "employeeLifecycle.offboarding.cancel"
      || options.moduleCancelAnyPermission === "employeeLifecycle.offboarding.cancelAny"
      || options.moduleCancelPermission === "employeeDiscipline.actions.cancel"
      || options.moduleCancelAnyPermission === "employeeDiscipline.actions.cancelAny"
    );
  if (moduleBoundCancel && (isRequesterUser || isRequesterEmployee) && options.moduleCancelPermission && permissionService.hasPermission(context, options.moduleCancelPermission)) return true;
  if (moduleBoundCancel && options.moduleCancelAnyPermission && (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, options.moduleCancelAnyPermission))) {
    if (!isRequesterUser && !isRequesterEmployee && !reason?.trim()) {
      throw new ValidationError("A cancellation reason is required when cancelling another employee's approval request.");
    }
    return true;
  }
  if ((isRequesterUser || isRequesterEmployee) && permissionService.hasPermission(context, "approvals.requests.cancel")) return true;
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "approvals.requests.cancelAny")) {
    if (!isRequesterUser && !isRequesterEmployee && !reason?.trim()) {
      throw new ValidationError("A cancellation reason is required when cancelling another employee's approval request.");
    }
    return true;
  }
  throw new PermissionError("You cannot cancel this approval request.");
};

export const buildApprovalRequestVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "approvals.requests.view")) {
    return { extra: undefined, values: [] as unknown[] };
  }

  const clauses = ["r.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  clauses.push("EXISTS (SELECT 1 FROM approval_request_steps s WHERE s.company_id = r.company_id AND s.approval_request_id = r.id AND s.assigned_approver_user_id = ?)");
  values.push(context.actorUserId);

  if (permissionService.hasAnyPermission(context, ["approvals.hrFinal.view", "approvals.hrFinal.approve", "approvals.hrFinal.reject"])) {
    clauses.push("EXISTS (SELECT 1 FROM approval_request_steps s WHERE s.company_id = r.company_id AND s.approval_request_id = r.id AND s.approver_resolver_type = 'HR_FINAL_APPROVER' AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER'))");
  }
  if (permissionService.hasAnyPermission(context, ["approvals.financeFinal.view", "approvals.financeFinal.approve", "approvals.financeFinal.reject"])) {
    clauses.push("EXISTS (SELECT 1 FROM approval_request_steps s WHERE s.company_id = r.company_id AND s.approval_request_id = r.id AND s.approver_resolver_type = 'FINANCE_FINAL_APPROVER' AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER'))");
  }

  // Department visibility policy: approvals.department.view allows same-department
  // request visibility, while approvals.department.approve/reject are still
  // required separately before an approver can act on a step.
  const employee = await actorEmployee(env, context);
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"])) {
    clauses.push(`(r.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
         WHERE s.company_id = r.company_id AND s.approval_request_id = r.id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }

  return { extra: `(${clauses.join(" OR ")})`, values };
};

const buildMyPendingVisibilityFilter = async (env: Env, context: AuthActor) => {
  const clauses = ["s.assigned_approver_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  if (permissionService.hasAnyPermission(context, ["approvals.hrFinal.approve", "approvals.hrFinal.reject"])) {
    clauses.push("s.approver_resolver_type = 'HR_FINAL_APPROVER'");
  }
  if (permissionService.hasAnyPermission(context, ["approvals.financeFinal.approve", "approvals.financeFinal.reject"])) {
    clauses.push("s.approver_resolver_type = 'FINANCE_FINAL_APPROVER'");
  }
  const employee = await actorEmployee(env, context);
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.approve", "approvals.department.reject"])) {
    clauses.push(`(s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
      AND r.department_id = ? AND (s.assigned_approver_user_id IS NULL OR s.assigned_approver_user_id = ?)
      AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
      AND (s.required_max_level IS NULL OR ? <= s.required_max_level))`);
    values.push(employee.department_id, context.actorUserId, employee.level ?? 0, employee.level ?? 99);
  }
  return {
    extra: `EXISTS (SELECT 1 FROM approval_request_steps s WHERE s.company_id = r.company_id AND s.approval_request_id = r.id AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER') AND (${clauses.join(" OR ")}))`,
    values,
  };
};

const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityType: string; entityId: string; approvalRequestId?: string; reason?: string | null; details?: Record<string, unknown> },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "approval_workflow_engine",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: context.actorUserId,
    reason: input.reason ?? undefined,
    approvalRequestId: input.approvalRequestId,
    details: input.details,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
};

export const listWorkflows = async (env: Env, context: AuthActor, filters: ApprovalEngineFilters) => {
  const [total, rows] = await Promise.all([
    repository.countWorkflows(env, context.companyId, filters),
    repository.listWorkflows(env, context.companyId, filters),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const getWorkflow = async (env: Env, context: AuthActor, workflowId: string) => {
  const workflow = await repository.findWorkflowById(env, context.companyId, workflowId);
  if (!workflow) throw new NotFoundError("The requested approval workflow could not be found.");
  return workflow;
};

export const createWorkflow = async (env: Env, context: AuthActor, input: ApprovalWorkflowInput) => {
  requireField(input.code, "Workflow code");
  requireField(input.name, "Workflow name");
  assertAllowedValue(input.operation_type, APPROVAL_OPERATION_TYPES, "Operation type");
  if (input.status) assertAllowedValue(input.status, APPROVAL_WORKFLOW_STATUSES, "Workflow status");
  assertLevelRange(input.applies_to_level_min, input.applies_to_level_max);
  if (await repository.findWorkflowByCode(env, context.companyId, input.code)) {
    throw new ConflictError("A workflow with this code already exists.");
  }
  const id = createPrefixedId("approval_workflow");
  await repository.createWorkflow(env, id, context.companyId, context.actorUserId, input);
  await audit(env, context, { action: "approval_workflow_created", entityType: "approval_workflow", entityId: id, details: { code: input.code } });
  return getWorkflow(env, context, id);
};

export const updateWorkflow = async (env: Env, context: AuthActor, workflowId: string, input: Partial<ApprovalWorkflowInput>) => {
  const existing = await getWorkflow(env, context, workflowId);
  if (input.code && await repository.findWorkflowByCode(env, context.companyId, input.code, workflowId)) {
    throw new ConflictError("A workflow with this code already exists.");
  }
  if (input.operation_type) assertAllowedValue(input.operation_type, APPROVAL_OPERATION_TYPES, "Operation type");
  assertLevelRange(input.applies_to_level_min, input.applies_to_level_max);
  await repository.updateWorkflow(env, context.companyId, workflowId, context.actorUserId, input);
  await audit(env, context, { action: "approval_workflow_updated", entityType: "approval_workflow", entityId: workflowId, details: { previous_status: existing.status } });
  return getWorkflow(env, context, workflowId);
};

export const setWorkflowStatus = async (env: Env, context: AuthActor, workflowId: string, status: "ACTIVE" | "INACTIVE") => {
  await getWorkflow(env, context, workflowId);
  await repository.setWorkflowStatus(env, context.companyId, workflowId, context.actorUserId, status);
  await audit(env, context, { action: status === "ACTIVE" ? "approval_workflow_activated" : "approval_workflow_deactivated", entityType: "approval_workflow", entityId: workflowId });
  return getWorkflow(env, context, workflowId);
};

export const archiveWorkflow = async (env: Env, context: AuthActor, workflowId: string, reason?: string | null) => {
  await getWorkflow(env, context, workflowId);
  await repository.archiveWorkflow(env, context.companyId, workflowId, context.actorUserId);
  await audit(env, context, { action: "approval_workflow_archived", entityType: "approval_workflow", entityId: workflowId, reason });
  return { archived: true };
};

export const listWorkflowSteps = async (env: Env, context: AuthActor, workflowId: string) => {
  await getWorkflow(env, context, workflowId);
  return repository.listWorkflowSteps(env, context.companyId, workflowId);
};

export const createWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, input: ApprovalWorkflowStepInput) => {
  await getWorkflow(env, context, workflowId);
  requireField(input.step_name, "Step name");
  assertAllowedValue(input.approver_resolver_type, APPROVER_RESOLVER_TYPES, "Approver resolver");
  if (input.fallback_behavior) assertAllowedValue(input.fallback_behavior, APPROVAL_FALLBACK_BEHAVIORS, "Fallback behavior");
  assertLevelRange(input.required_min_level, input.required_max_level);
  if (await repository.findStepByOrder(env, context.companyId, workflowId, input.step_order)) {
    throw new ConflictError("A workflow step already uses this order.");
  }
  const id = createPrefixedId("approval_step");
  await repository.createWorkflowStep(env, id, context.companyId, workflowId, context.actorUserId, input);
  await audit(env, context, { action: "approval_workflow_step_created", entityType: "approval_workflow_step", entityId: id });
  return repository.findWorkflowStepById(env, context.companyId, workflowId, id);
};

export const updateWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, stepId: string, input: Partial<ApprovalWorkflowStepInput>) => {
  const existing = await repository.findWorkflowStepById(env, context.companyId, workflowId, stepId);
  if (!existing) throw new NotFoundError("The requested workflow step could not be found.");
  if (input.approver_resolver_type) assertAllowedValue(input.approver_resolver_type, APPROVER_RESOLVER_TYPES, "Approver resolver");
  if (input.fallback_behavior) assertAllowedValue(input.fallback_behavior, APPROVAL_FALLBACK_BEHAVIORS, "Fallback behavior");
  assertLevelRange(input.required_min_level, input.required_max_level);
  if (input.step_order && await repository.findStepByOrder(env, context.companyId, workflowId, input.step_order, stepId)) {
    throw new ConflictError("A workflow step already uses this order.");
  }
  await repository.updateWorkflowStep(env, context.companyId, workflowId, stepId, context.actorUserId, input);
  await audit(env, context, { action: "approval_workflow_step_updated", entityType: "approval_workflow_step", entityId: stepId });
  return repository.findWorkflowStepById(env, context.companyId, workflowId, stepId);
};

export const setWorkflowStepActive = async (env: Env, context: AuthActor, workflowId: string, stepId: string, active: boolean) => {
  if (!await repository.findWorkflowStepById(env, context.companyId, workflowId, stepId)) {
    throw new NotFoundError("The requested workflow step could not be found.");
  }
  await repository.setWorkflowStepActive(env, context.companyId, workflowId, stepId, context.actorUserId, active);
  await audit(env, context, { action: active ? "approval_workflow_step_enabled" : "approval_workflow_step_disabled", entityType: "approval_workflow_step", entityId: stepId });
  return repository.findWorkflowStepById(env, context.companyId, workflowId, stepId);
};

export const reorderWorkflowSteps = async (env: Env, context: AuthActor, workflowId: string, steps: Array<{ id: string; step_order: number }>) => {
  await getWorkflow(env, context, workflowId);
  await env.DB.batch(steps.map((step) =>
    env.DB.prepare("UPDATE approval_steps SET step_order = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND workflow_id = ? AND id = ?")
      .bind(step.step_order, nowIso(), context.actorUserId, context.companyId, workflowId, step.id),
  ));
  await audit(env, context, { action: "approval_workflow_steps_reordered", entityType: "approval_workflow", entityId: workflowId });
  return listWorkflowSteps(env, context, workflowId);
};

export const listRequests = async (env: Env, context: AuthActor, filters: ApprovalEngineFilters) => {
  const visibility = await buildApprovalRequestVisibilityFilter(env, context);
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, visibility.extra, visibility.values),
    repository.listRequests(env, context.companyId, filters, visibility.extra, visibility.values),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

const canUseModuleBoundCreateForOthers = (context: AuthActor, input: ApprovalRequestInput, options?: ApprovalDraftOptions) =>
  Boolean(
    options?.allowModuleBoundCreateForOthers &&
    (
      (
        options.moduleOperationType === "LEAVE_REQUEST" &&
        input.operation_type === "LEAVE_REQUEST" &&
        options.modulePermission === "leave.requests.create_for_employee" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "leave.requests.create_for_employee"))
      ) ||
      (
        options.moduleOperationType === "ATTENDANCE_CORRECTION" &&
        input.operation_type === "ATTENDANCE_CORRECTION" &&
        options.modulePermission === "attendance.corrections.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "attendance.corrections.createForOthers"))
      ) ||
      (
        options.moduleOperationType === "ROSTER_CHANGE" &&
        input.operation_type === "ROSTER_CHANGE" &&
        options.modulePermission === "roster.changes.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "roster.changes.createForOthers"))
      ) ||
      (
        options.moduleOperationType === "PAYROLL_ADJUSTMENT" &&
        input.operation_type === "PAYROLL_ADJUSTMENT" &&
        options.modulePermission === "payroll.adjustments.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "payroll.adjustments.createForOthers"))
      ) ||
      (
        options.moduleOperationType === "ADVANCE_SALARY_REQUEST" &&
        input.operation_type === "ADVANCE_SALARY_REQUEST" &&
        options.modulePermission === "advanceSalary.requests.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "advanceSalary.requests.createForOthers"))
      ) ||
      (
        options.moduleOperationType === "DOCUMENT_KYC_UPDATE" &&
        input.operation_type === "DOCUMENT_KYC_UPDATE" &&
        options.modulePermission === "documentKyc.requests.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "documentKyc.requests.createForOthers"))
      ) ||
      (
        (options.moduleOperationType === "EMPLOYEE_TRANSFER" || options.moduleOperationType === "EMPLOYEE_STRUCTURE_CHANGE") &&
        options.moduleOperationType === input.operation_type &&
        options.modulePermission === "employees.structureRequests.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "employees.structureRequests.createForOthers"))
      ) ||
      (
        (options.moduleOperationType === "RESIGNATION" || options.moduleOperationType === "OFFBOARDING") &&
        options.moduleOperationType === input.operation_type &&
        (options.modulePermission === "employeeLifecycle.resignations.createForOthers" || options.modulePermission === "employeeLifecycle.offboarding.createForOthers") &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, options.modulePermission))
      ) ||
      (
        options.moduleOperationType === "DISCIPLINARY_ACTION" &&
        input.operation_type === "DISCIPLINARY_ACTION" &&
        options.modulePermission === "employeeDiscipline.actions.createForOthers" &&
        (permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "employeeDiscipline.actions.createForOthers"))
      )
    ),
  );

export const createApprovalRequestDraft = async (env: Env, context: AuthActor, input: ApprovalRequestInput, options?: ApprovalDraftOptions) => {
  requireField(input.operation_type, "Operation type");
  assertAllowedValue(input.operation_type, APPROVAL_OPERATION_TYPES, "Operation type");
  requireField(input.subject_type, "Subject type");
  requireField(input.subject_id, "Subject");
  requireField(input.title, "Request title");
  assertSafePayload(input.payload_json);

  const requesterEmployee = await actorEmployee(env, context);
  const moduleBoundCreateForOthers = canUseModuleBoundCreateForOthers(context, input, options);
  const canCreateForOthers =
    permissionService.isSuperAdmin(context) ||
    permissionService.hasPermission(context, "approvals.requests.createForOthers") ||
    moduleBoundCreateForOthers;
  if (!canCreateForOthers && input.requester_employee_id && input.requester_employee_id !== requesterEmployee?.employee_id) {
    throw new PermissionError("You cannot create approval requests on behalf of another employee.");
  }
  if (!canCreateForOthers && input.subject_employee_id && input.subject_employee_id !== requesterEmployee?.employee_id) {
    throw new PermissionError("You cannot create approval requests for another employee.");
  }

  const requesterEmployeeId = canCreateForOthers
    ? input.requester_employee_id ?? requesterEmployee?.employee_id ?? null
    : requesterEmployee?.employee_id ?? null;
  let subjectEmployeeId = input.subject_employee_id ?? requesterEmployeeId;
  let departmentId = input.department_id ?? null;
  let positionId = input.position_id ?? null;
  let level = input.level ?? null;

  if (subjectEmployeeId) {
    const subject = await repository.findEmployeeForApproval(env, context.companyId, subjectEmployeeId);
    if (!subject || !isActiveEmployee(subject)) {
      throw new ValidationError("Please choose an active employee from this company for the approval subject.");
    }
    subjectEmployeeId = subject.employee_id;
    departmentId = subject.department_id;
    positionId = subject.position_id;
    level = subject.level;
  }

  const workflow = input.workflow_id
    ? await repository.findWorkflowById(env, context.companyId, input.workflow_id)
    : await repository.findWorkflowForOperation(env, context.companyId, {
      operationType: input.operation_type,
      departmentId,
      level,
    });
  if (!workflow || workflow.status !== "ACTIVE") {
    throw new ValidationError("No active approval workflow is configured for this operation.");
  }
  const id = createPrefixedId("approval_request");
  await repository.createRequest(env, id, context.companyId, context.actorUserId, workflow.id, {
    ...input,
    requester_employee_id: requesterEmployeeId,
    subject_employee_id: subjectEmployeeId,
    department_id: departmentId,
    position_id: positionId,
    level,
  });
  await audit(env, context, {
    action: "approval_request_created",
    entityType: "approval_request",
    entityId: id,
    approvalRequestId: id,
    details: {
      operation_type: input.operation_type,
      module_bound_create_for_others: moduleBoundCreateForOthers,
      module_permission: moduleBoundCreateForOthers ? options?.modulePermission : null,
    },
  });
  return repository.findRequestById(env, context.companyId, id);
};

const nextPendingStep = (steps: ApprovalRequestStepEngineRecord[]) =>
  steps.find((step) => step.status === "PENDING" || step.status === "WAITING_FOR_APPROVER" || step.status === "ESCALATED") ?? null;

export const submitApprovalRequest = async (env: Env, context: AuthActor, requestId: string) => {
  const request = await repository.findRequestById(env, context.companyId, requestId);
  if (!request) throw new NotFoundError("The requested approval request could not be found.");
  if (request.status !== "DRAFT") throw new ConflictError("Only draft approval requests can be submitted.");
  await canSubmitApprovalRequest(env, context, request);
  const workflowSteps = (await repository.listWorkflowSteps(env, context.companyId, request.workflow_id)).filter((step) => step.is_active === 1);
  if (workflowSteps.length === 0) throw new ValidationError("This workflow has no active approval steps.");

  for (const step of workflowSteps) {
    const resolution = await resolveApproversForStep(env, request, step);
    if (resolution.status === "BLOCKED") {
      throw new ValidationError(resolution.message);
    }
    if (resolution.status === "SKIPPED" && (step.is_final_step === 1 || step.approver_resolver_type === "HR_FINAL_APPROVER" || step.approver_resolver_type === "FINANCE_FINAL_APPROVER")) {
      throw new ValidationError("Final approval steps cannot be skipped. Configure escalation, manual assignment, or block submission for this fallback.");
    }
    await repository.createRequestStep(env, createPrefixedId("approval_req_step"), context.companyId, request.id, step, {
      assignedUserId: resolution.assignedApprover?.user_id ?? null,
      assignedEmployeeId: resolution.assignedApprover?.employee_id ?? null,
      assignedDepartmentId: resolution.assignedApprover?.department_id ?? request.department_id ?? null,
      status: resolution.status === "RESOLVED" ? "PENDING" : resolution.status === "ESCALATED" ? "ESCALATED" : resolution.status === "WAITING_FOR_APPROVER" ? "WAITING_FOR_APPROVER" : "SKIPPED",
      fallbackApplied: resolution.fallbackApplied,
    });
  }

  const generatedSteps = await repository.listRequestSteps(env, context.companyId, request.id);
  const current = nextPendingStep(generatedSteps);
  if (!current) {
    throw new ValidationError("The workflow could not resolve a valid approval step. Please assign an approver or review fallback settings.");
  }
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: current.status === "WAITING_FOR_APPROVER" ? "NEEDS_MANUAL_ASSIGNMENT" : "IN_REVIEW",
    currentStepId: current.id,
    actorId: context.actorUserId,
    timestampColumn: "submitted_at",
  });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId: request.id,
    action: "SUBMIT",
    actorUserId: context.actorUserId,
    fromStatus: request.status,
    toStatus: "IN_REVIEW",
  });
  await audit(env, context, { action: "approval_request_submitted", entityType: "approval_request", entityId: request.id, approvalRequestId: request.id });
  return repository.findRequestById(env, context.companyId, request.id);
};

const ensureActionableRequest = async (env: Env, context: AuthActor, requestId: string) => {
  const request = await repository.findRequestById(env, context.companyId, requestId);
  if (!request) throw new NotFoundError("The requested approval request could not be found.");
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(request.status)) {
    throw new ConflictError("This approval request is already completed.");
  }
  const steps = await repository.listRequestSteps(env, context.companyId, request.id);
  const current = steps.find((step) => step.id === request.current_step_id) ?? nextPendingStep(steps);
  if (!current) throw new ConflictError("This approval request has no active approval step.");
  return { request, steps, current };
};

const assertGenericActionAllowed = (request: ApprovalRequestEngineRecord, options?: ApprovalEngineActionOptions) => {
  if (request.operation_type === "LEAVE_REQUEST" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_LEAVE_ACTION_MESSAGE);
  }
  if (request.operation_type === "ATTENDANCE_CORRECTION" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_ATTENDANCE_CORRECTION_ACTION_MESSAGE);
  }
  if (request.operation_type === "ROSTER_CHANGE" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_ROSTER_CHANGE_ACTION_MESSAGE);
  }
  if (request.operation_type === "PAYROLL_ADJUSTMENT" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_PAYROLL_ADJUSTMENT_ACTION_MESSAGE);
  }
  if (request.operation_type === "ADVANCE_SALARY_REQUEST" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_ADVANCE_SALARY_ACTION_MESSAGE);
  }
  if ((request.operation_type === "DOCUMENT_KYC_UPDATE" || request.operation_type === "DOCUMENT_APPROVAL") && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_DOCUMENT_KYC_ACTION_MESSAGE);
  }
  if ((request.operation_type === "EMPLOYEE_TRANSFER" || request.operation_type === "EMPLOYEE_STRUCTURE_CHANGE") && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_EMPLOYEE_STRUCTURE_ACTION_MESSAGE);
  }
  // Contract coverage: generic approval route blocks RESIGNATION and OFFBOARDING.
  if ((request.operation_type === "RESIGNATION" || request.operation_type === "OFFBOARDING") && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_EMPLOYEE_LIFECYCLE_ACTION_MESSAGE);
  }
  // Contract coverage: generic approval route blocks DISCIPLINARY_ACTION.
  if (request.operation_type === "DISCIPLINARY_ACTION" && !options?.allowModuleBoundAction) {
    throw new ConflictError(MODULE_BOUND_DISCIPLINARY_ACTION_MESSAGE);
  }
};

export const approveStep = async (env: Env, context: AuthActor, requestId: string, comment?: string | null, options?: ApprovalEngineActionOptions) => {
  const { request, steps, current } = await ensureActionableRequest(env, context, requestId);
  assertGenericActionAllowed(request, options);
  await canActOnApprovalStep(env, context, request, current, "approve");
  await repository.updateRequestStepStatus(env, context.companyId, current.id, { status: "APPROVED", timestampColumn: "approved_at" });
  const next = nextPendingStep(steps.filter((step) => step.id !== current.id));
  const final = !next || current.step_order >= Math.max(...steps.map((step) => step.step_order));
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: final ? "APPROVED" : next.status === "WAITING_FOR_APPROVER" ? "NEEDS_MANUAL_ASSIGNMENT" : "IN_REVIEW",
    currentStepId: final ? null : next.id,
    actorId: context.actorUserId,
    timestampColumn: final ? "approved_at" : null,
  });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId: request.id,
    stepId: current.id,
    action: "APPROVE",
    actorUserId: context.actorUserId,
    fromStatus: current.status,
    toStatus: "APPROVED",
    comment,
  });
  await audit(env, context, { action: final ? "approval_request_final_approved" : "approval_step_approved", entityType: "approval_request", entityId: request.id, approvalRequestId: request.id });
  return repository.findRequestById(env, context.companyId, request.id);
};

export const rejectStep = async (env: Env, context: AuthActor, requestId: string, reason: string, comment?: string | null, options?: ApprovalEngineActionOptions) => {
  if (!reason?.trim()) throw new ValidationError("A rejection reason is required.");
  const { request, current } = await ensureActionableRequest(env, context, requestId);
  assertGenericActionAllowed(request, options);
  await canActOnApprovalStep(env, context, request, current, "reject");
  await repository.updateRequestStepStatus(env, context.companyId, current.id, { status: "REJECTED", timestampColumn: "rejected_at" });
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "REJECTED",
    currentStepId: null,
    actorId: context.actorUserId,
    timestampColumn: "rejected_at",
  });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId: request.id,
    stepId: current.id,
    action: "REJECT",
    actorUserId: context.actorUserId,
    fromStatus: request.status,
    toStatus: "REJECTED",
    reason,
    comment,
  });
  await audit(env, context, { action: "approval_request_rejected", entityType: "approval_request", entityId: request.id, approvalRequestId: request.id, reason });
  return repository.findRequestById(env, context.companyId, request.id);
};

export const cancelRequest = async (env: Env, context: AuthActor, requestId: string, reason?: string | null, options?: ApprovalEngineActionOptions) => {
  const request = await repository.findRequestById(env, context.companyId, requestId);
  if (!request) throw new NotFoundError("The requested approval request could not be found.");
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(request.status)) throw new ConflictError("This approval request is already completed.");
  assertGenericActionAllowed(request, options);
  await canCancelApprovalRequest(env, context, request, reason, options);
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "CANCELLED",
    currentStepId: null,
    actorId: context.actorUserId,
    timestampColumn: "cancelled_at",
  });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId: request.id,
    action: "CANCEL",
    actorUserId: context.actorUserId,
    fromStatus: request.status,
    toStatus: "CANCELLED",
    reason,
  });
  await audit(env, context, { action: "approval_request_cancelled", entityType: "approval_request", entityId: request.id, approvalRequestId: request.id, reason });
  return repository.findRequestById(env, context.companyId, request.id);
};

export const assignApprover = async (env: Env, context: AuthActor, requestId: string, stepId: string, userId: string, reason: string) => {
  if (!permissionService.hasPermission(context, "approvals.requests.assign")) throw new PermissionError();
  if (!reason?.trim()) throw new ValidationError("A reason is required to assign an approver.");
  const request = await repository.findRequestById(env, context.companyId, requestId);
  if (!request) throw new NotFoundError("The requested approval request could not be found.");
  const step = await repository.findRequestStepById(env, context.companyId, requestId, stepId);
  if (!step) throw new NotFoundError("The requested approval step could not be found.");
  const workflowStep = await repository.findWorkflowStepById(env, context.companyId, request.workflow_id, step.workflow_step_id);
  const allowSelfApproval = workflowStep?.allow_self_approval === 1;
  if (!allowSelfApproval && request.requester_user_id === userId) {
    throw new PermissionError("The requester cannot be assigned as approver unless self-approval is explicitly enabled.");
  }
  const departmentId = isDepartmentStep(step) && !permissionService.isSuperAdmin(context)
    ? step.assigned_department_id ?? request.department_id
    : null;
  const candidate = await repository.findAssignableApprover(env, context.companyId, userId, {
    requiredPermission: step.required_permission,
    requiredRoleId: step.required_role_id,
    departmentId,
    minLevel: isDepartmentStep(step) ? step.required_min_level : null,
    maxLevel: isDepartmentStep(step) ? step.required_max_level : null,
    requireLinkedEmployee: isDepartmentStep(step),
  });
  if (!candidate) {
    throw new ValidationError("The selected user is not eligible for this approval step.");
  }
  if (!allowSelfApproval && (candidate.user_id === request.requester_user_id || (candidate.employee_id && candidate.employee_id === request.requester_employee_id))) {
    throw new PermissionError("The requester cannot be assigned as approver unless self-approval is explicitly enabled.");
  }
  await repository.updateRequestStepStatus(env, context.companyId, stepId, {
    status: "PENDING",
    assignedUserId: userId,
    assignedEmployeeId: candidate.employee_id ?? null,
  });
  await repository.updateRequestStatus(env, context.companyId, requestId, { status: "IN_REVIEW", currentStepId: stepId, actorId: context.actorUserId });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId,
    stepId,
    action: "ASSIGN_APPROVER",
    actorUserId: context.actorUserId,
    fromStatus: step.status,
    toStatus: "PENDING",
    reason,
    metadata: { assigned_user_id: userId },
  });
  await audit(env, context, { action: "approval_step_assigned", entityType: "approval_request_step", entityId: stepId, approvalRequestId: requestId, reason });
  return repository.findRequestById(env, context.companyId, requestId);
};

export const escalateRequest = async (env: Env, context: AuthActor, requestId: string, reason: string) => {
  if (!permissionService.hasPermission(context, "approvals.requests.escalate")) throw new PermissionError();
  if (!reason?.trim()) throw new ValidationError("A reason is required to escalate a request.");
  const { request, current } = await ensureActionableRequest(env, context, requestId);
  await repository.updateRequestStepStatus(env, context.companyId, current.id, {
    status: "ESCALATED",
    timestampColumn: "escalated_at",
    fallbackApplied: "ESCALATE_TO_SUPER_ADMIN",
  });
  await repository.updateRequestStatus(env, context.companyId, request.id, { status: "ESCALATED", currentStepId: current.id, actorId: context.actorUserId });
  await repository.createAction(env, {
    id: createPrefixedId("approval_action"),
    companyId: context.companyId,
    requestId: request.id,
    stepId: current.id,
    action: "ESCALATE",
    actorUserId: context.actorUserId,
    fromStatus: current.status,
    toStatus: "ESCALATED",
    reason,
  });
  await audit(env, context, { action: "approval_step_escalated", entityType: "approval_request_step", entityId: current.id, approvalRequestId: request.id, reason });
  return repository.findRequestById(env, context.companyId, request.id);
};

export const getTimeline = async (env: Env, context: AuthActor, requestId: string) => {
  const request = await repository.findRequestById(env, context.companyId, requestId);
  if (!request) throw new NotFoundError("The requested approval request could not be found.");
  const steps = await repository.listRequestSteps(env, context.companyId, requestId);
  if (!await canViewApprovalRequest(env, context, request, steps)) {
    throw new PermissionError("You do not have access to this approval request.");
  }
  return {
    request,
    steps,
    actions: await repository.listActions(env, context.companyId, requestId),
  };
};

export const getMyPending = async (env: Env, context: AuthActor, filters: ApprovalEngineFilters) => {
  const pending = await buildMyPendingVisibilityFilter(env, context);
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, pending.extra, pending.values),
    repository.listRequests(env, context.companyId, filters, pending.extra, pending.values),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const getMyRequests = async (env: Env, context: AuthActor, filters: ApprovalEngineFilters) => {
  const extra = "r.requester_user_id = ?";
  const values = [context.actorUserId];
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, extra, values),
    repository.listRequests(env, context.companyId, filters, extra, values),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const seedDefaultWorkflowTemplate = async (env: Env, context: AuthActor, operationType: "LEAVE_REQUEST" | "ATTENDANCE_CORRECTION" | "ROSTER_CHANGE" | "EMPLOYEE_DOCUMENT_UPDATE") => {
  const code = `${operationType}_DEFAULT`;
  const existing = await repository.findWorkflowByCode(env, context.companyId, code);
  if (existing) return existing;
  const workflow = await createWorkflow(env, context, {
    code,
    name: `${operationType.replace(/_/g, " ")} Default Workflow`,
    operation_type: operationType,
    status: "ACTIVE",
    is_default: true,
  });
  await createWorkflowStep(env, context, workflow.id, {
    step_order: 1,
    step_code: "DEPARTMENT_APPROVAL",
    step_name: "Department Approval",
    approver_resolver_type: "DEPARTMENT_LEVEL",
    required_permission: "approvals.department.approve",
    required_min_level: 3,
    required_max_level: 4,
    fallback_behavior: "SKIP_TO_HR",
  });
  await createWorkflowStep(env, context, workflow.id, {
    step_order: 2,
    step_code: "HR_FINAL_APPROVAL",
    step_name: "HR Final Approval",
    approver_resolver_type: "HR_FINAL_APPROVER",
    required_permission: "approvals.hrFinal.approve",
    is_final_step: true,
    fallback_behavior: "ESCALATE_TO_SUPER_ADMIN",
  });
  return getWorkflow(env, context, workflow.id);
};
