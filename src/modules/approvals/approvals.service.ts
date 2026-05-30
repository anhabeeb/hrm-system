import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as realtimeService from "../../services/realtime.service";
import * as settingsService from "../../services/settings.service";
import { AppError, NotFoundError, OutletAccessError, PermissionError, ValidationError } from "../../utils/errors";

import { assertApprovalIsActionable, assertNotSelfApproval } from "./approval-action.service";
import { getApprovalDirectDecision } from "./approval-direct.service";
import { applyApprovedTargetChange, applyRejectedTargetChange } from "./approval-integration.service";
import { canActorApproveStep, findNextRequiredStep } from "./approval-step.service";
import * as thresholdService from "./approval-threshold.service";
import * as workflowService from "./approval-workflow.service";
import * as repository from "./approvals.repository";
import type {
  ApprovalActionInput,
  ApprovalListFilters,
  ApprovalOutletScope,
  ApprovalOverrideInput,
  StepInput,
  ThresholdFilters,
  ThresholdInput,
  WorkflowFilters,
  WorkflowInput,
  WorkflowUpdateInput,
} from "./approvals.types";

const buildScope = (context: AuthActor): ApprovalOutletScope => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
  userId: context.actorUserId,
  roleKeys: context.roleKeys,
  permissions: context.permissions,
});

const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  page_size: pageSize,
  total,
  total_pages: Math.ceil(total / pageSize),
});

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const sanitizePayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizePayload);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const blocked = ["token", "hash", "secret", "password", "file_key", "bank", "passport", "id_card"];
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.some((blockedKey) => key.toLowerCase().includes(blockedKey)))
      .map(([key, nested]) => [key, sanitizePayload(nested)]),
  );
};

const requestToResponse = async (env: Env, context: AuthActor, request: any) => {
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  const actionable = !["approved", "rejected", "returned", "returned_for_more_info", "cancelled"].includes(request.status);
  const assigned = canActorApproveStep(context, step);
  return {
    id: request.id,
    workflow_id: request.workflow_id,
    workflow_key: request.workflow_key,
    workflow_name: request.workflow_name,
    module: request.module,
    entity_type: request.entity_type,
    entity_id: request.entity_id,
    employee_id: request.employee_id,
    employee_name: request.employee_name,
    outlet_id: request.outlet_id,
    outlet_name: request.outlet_name,
    requested_by: request.requested_by,
    requested_by_name: request.requested_by_name,
    status: request.status,
    current_step: request.current_step,
    waiting_for_role_key: request.waiting_for_role_key ?? step?.required_role_key ?? null,
    waiting_for_permission_key: request.waiting_for_permission_key ?? step?.required_permission_key ?? null,
    summary: request.summary,
    payload_summary: sanitizePayload(parseJson(request.payload_json, null)),
    created_at: request.created_at,
    updated_at: request.updated_at,
    actions_available: {
      can_approve: actionable && assigned && request.requested_by !== context.actorUserId,
      can_reject: actionable && assigned && request.requested_by !== context.actorUserId,
      can_return: actionable && assigned && request.requested_by !== context.actorUserId,
      can_override: actionable && permissionService.isSuperAdmin(context),
    },
  };
};

const assertAccess = (context: AuthActor, request: any, step: any): void => {
  if (permissionService.isSuperAdmin(context)) return;
  if (request.requested_by === context.actorUserId) return;
  if (request.outlet_id && context.outletIds.includes(request.outlet_id)) return;
  throw new OutletAccessError("You do not have access to this approval request.");
};

const assertCurrentStepAccess = (context: AuthActor, step: any): void => {
  if (!canActorApproveStep(context, step)) {
    throw new AppError("This request is waiting for a different approval step.", "APPROVAL_STEP_NOT_ASSIGNED", 403);
  }
};

const auditOrFail = async (
  env: Env,
  context: AuthActor,
  input: Omit<auditService.AuditLogInput, "companyId" | "actorId" | "ipAddress" | "userAgent" | "requestId">,
): Promise<void> => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    actorId: context.actorUserId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    requestId: context.requestId,
    ...input,
  });
  if (!result.created) {
    throw new AppError("This action could not be completed because the audit log could not be recorded.", "AUDIT_LOG_REQUIRED", 500);
  }
};

const broadcastSafe = async (env: Env, companyId: string, type: string, payload: Record<string, unknown>, actorId: string) => {
  try {
    await realtimeService.broadcastEvent(env, {
      roomName: `company:${companyId}`,
      type,
      payload,
      triggeredBy: actorId,
    });
  } catch (error) {
    console.warn("Approval realtime placeholder could not be sent", { type, error });
  }
};

export const listApprovalRequests = async (env: Env, context: AuthActor, filters: ApprovalListFilters) => {
  const scope = buildScope(context);
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, scope),
    repository.listRequests(env, context.companyId, filters, scope),
  ]);
  return {
    rows: await Promise.all(rows.map((row) => requestToResponse(env, context, row))),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getApprovalRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  assertAccess(context, request, step);
  return requestToResponse(env, context, request);
};

export const getApprovalHistory = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  assertAccess(context, request, step);
  return repository.listActions(env, context.companyId, id);
};

const actOnApproval = async (
  env: Env,
  context: AuthActor,
  id: string,
  action: "approve" | "reject" | "return",
  input: ApprovalActionInput,
) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  const steps = await repository.listSteps(env, context.companyId, request.workflow_id);
  const currentStep = steps.find((step) => Number(step.step_order) === Number(request.current_step ?? 1));
  assertAccess(context, request, currentStep);
  assertApprovalIsActionable(request.status);
  assertNotSelfApproval(request.requested_by, context.actorUserId);
  assertCurrentStepAccess(context, currentStep);

  const oldStatus = request.status;
  let newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned";
  let nextStep: number | undefined;
  let integration = {
    target_update_applied: false,
    target_update_note: "The approval decision was recorded.",
  };

  if (action === "approve") {
    const followingStep = findNextRequiredStep(steps, Number(request.current_step ?? 1));
    if (followingStep) {
      newStatus = "in_progress";
      nextStep = followingStep.step_order;
    } else {
      integration = await applyApprovedTargetChange(env, request);
    }
  } else if (action === "reject") {
    integration = await applyRejectedTargetChange(env, request);
  }

  await repository.createAction(env, {
    id: crypto.randomUUID(),
    companyId: context.companyId,
    requestId: id,
    stepOrder: Number(request.current_step ?? 1),
    action,
    actedBy: context.actorUserId,
    comment: input.comment ?? input.reason,
    oldStatus,
    newStatus,
  });
  await repository.updateRequestStatus(env, context.companyId, id, newStatus, nextStep);

  const auditAction = action === "approve" && nextStep ? "approval_step_approved" : `approval_request_${action === "return" ? "returned" : `${action}d`}`;
  await auditOrFail(env, context, {
    outletId: request.outlet_id ?? undefined,
    module: "approvals",
    action: auditAction,
    severity: action === "reject" ? "warning" : "info",
    entityType: "approval_request",
    entityId: id,
    employeeId: request.employee_id ?? undefined,
    oldValueJson: JSON.stringify({ status: oldStatus, current_step: request.current_step }),
    newValueJson: JSON.stringify({ status: newStatus, current_step: nextStep ?? request.current_step, ...integration }),
    reason: input.reason,
    approvalRequestId: id,
  });
  await broadcastSafe(env, context.companyId, `approval.${action}`, { approval_request_id: id, status: newStatus }, context.actorUserId);

  const messages = {
    approve: nextStep ? "Approval step completed." : "Approval request approved.",
    reject: "Approval request rejected.",
    return: "Approval request returned for more information.",
  };

  return { approval_request_id: id, status: newStatus, current_step: nextStep ?? request.current_step, ...integration, message: messages[action] };
};

export const approveApprovalRequest = (env: Env, context: AuthActor, id: string, input: ApprovalActionInput) =>
  actOnApproval(env, context, id, "approve", input);

export const rejectApprovalRequest = (env: Env, context: AuthActor, id: string, input: ApprovalActionInput) =>
  actOnApproval(env, context, id, "reject", input);

export const returnApprovalRequest = (env: Env, context: AuthActor, id: string, input: ApprovalActionInput) =>
  actOnApproval(env, context, id, "return", input);

export const overrideApprovalRequest = async (env: Env, context: AuthActor, id: string, input: ApprovalOverrideInput) => {
  if (!permissionService.isSuperAdmin(context)) {
    throw new PermissionError("Only Super Admin can override approval requests.");
  }
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  assertApprovalIsActionable(request.status);

  const newStatus = input.decision === "approve" ? "approved" : "rejected";
  const integration = input.decision === "approve"
    ? await applyApprovedTargetChange(env, request)
    : await applyRejectedTargetChange(env, request);

  await repository.createAction(env, {
    id: crypto.randomUUID(),
    companyId: context.companyId,
    requestId: id,
    stepOrder: Number(request.current_step ?? 1),
    action: `override_${input.decision}`,
    actedBy: context.actorUserId,
    comment: input.comment ?? input.reason,
    oldStatus: request.status,
    newStatus,
  });
  await repository.updateRequestStatus(env, context.companyId, id, newStatus);
  await auditOrFail(env, context, {
    outletId: request.outlet_id ?? undefined,
    module: "approvals",
    action: "approval_request_overridden",
    severity: "high",
    entityType: "approval_request",
    entityId: id,
    employeeId: request.employee_id ?? undefined,
    oldValueJson: JSON.stringify({ status: request.status }),
    newValueJson: JSON.stringify({ status: newStatus, decision: input.decision, ...integration }),
    reason: input.reason,
    approvalRequestId: id,
  });
  await broadcastSafe(env, context.companyId, "approval.override", { approval_request_id: id, status: newStatus }, context.actorUserId);
  return { approval_request_id: id, status: newStatus, ...integration };
};

export const createApprovalRequestForWorkflow = async (
  env: Env,
  context: AuthActor,
  input: {
    workflowKey: string;
    module: string;
    entityType: string;
    entityId: string;
    employeeId?: string | null;
    summary?: string;
    payload?: Record<string, unknown>;
  },
) => {
  const workflow = await workflowService.getWorkflowByKey(env, context.companyId, input.workflowKey);
  if (!workflow || workflow.is_enabled !== 1) {
    return { approval_required: false, direct_action_allowed: true, approval_request_id: null, message: "Approval workflow is not enabled for this action." };
  }

  const decision = await getApprovalDirectDecision(env, context.companyId, context, workflow.approval_mode);
  if (!decision.approval_required) {
    return { ...decision, approval_request_id: null };
  }

  const existing = await repository.findPendingRequestForEntity(env, context.companyId, workflow.id, input.entityType, input.entityId);
  if (existing) {
    return { ...decision, approval_request_id: existing.id, existing: true };
  }

  const id = crypto.randomUUID();
  await repository.createRequest(env, {
    id,
    companyId: context.companyId,
    workflowId: workflow.id,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId ?? null,
    requestedBy: context.actorUserId,
    summary: input.summary,
    payloadJson: JSON.stringify(sanitizePayload(input.payload ?? {})),
  });
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_request_created",
    severity: "info",
    entityType: "approval_request",
    entityId: id,
    employeeId: input.employeeId ?? undefined,
    newValueJson: JSON.stringify({ workflow_key: input.workflowKey, module: input.module, entity_type: input.entityType }),
    approvalRequestId: id,
  });
  await broadcastSafe(env, context.companyId, "approval.created", { approval_request_id: id, module: input.module }, context.actorUserId);
  return { ...decision, approval_request_id: id, existing: false };
};

export const listWorkflows = workflowService.listWorkflows;

export const getWorkflow = async (env: Env, context: AuthActor, id: string) => {
  const workflow = await repository.findWorkflowById(env, context.companyId, id);
  if (!workflow) throw new NotFoundError("Approval workflow not found.");
  return { ...workflow, steps: await repository.listSteps(env, context.companyId, id) };
};

export const createWorkflow = async (env: Env, context: AuthActor, input: WorkflowInput) => {
  const id = crypto.randomUUID();
  await workflowService.createWorkflow(env, id, context.companyId, input);
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_workflow_created",
    entityType: "approval_workflow",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  return getWorkflow(env, context, id);
};

export const updateWorkflow = async (env: Env, context: AuthActor, id: string, input: WorkflowUpdateInput) => {
  const old = await repository.findWorkflowById(env, context.companyId, id);
  if (!old) throw new NotFoundError("Approval workflow not found.");
  await workflowService.updateWorkflow(env, context.companyId, id, input);
  await auditOrFail(env, context, {
    module: "approvals",
    action: input.is_enabled === true ? "approval_workflow_enabled" : input.is_enabled === false ? "approval_workflow_disabled" : "approval_workflow_updated",
    entityType: "approval_workflow",
    entityId: id,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  return getWorkflow(env, context, id);
};

export const createWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, input: StepInput) => {
  const workflow = await repository.findWorkflowById(env, context.companyId, workflowId);
  if (!workflow) throw new NotFoundError("Approval workflow not found.");
  const id = crypto.randomUUID();
  await repository.createStep(env, id, context.companyId, workflowId, input);
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_created",
    entityType: "approval_step",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  return repository.findStepById(env, context.companyId, workflowId, id);
};

export const updateWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, stepId: string, input: StepInput) => {
  const old = await repository.findStepById(env, context.companyId, workflowId, stepId);
  if (!old) throw new NotFoundError("Approval step not found.");
  await repository.updateStep(env, context.companyId, workflowId, stepId, input);
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_updated",
    entityType: "approval_step",
    entityId: stepId,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  return repository.findStepById(env, context.companyId, workflowId, stepId);
};

export const deleteWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, stepId: string, reason: string) => {
  const step = await repository.findStepById(env, context.companyId, workflowId, stepId);
  if (!step) throw new NotFoundError("Approval step not found.");
  const pending = await repository.countPendingRequestsAtStep(env, context.companyId, workflowId, Number(step.step_order));
  if (pending > 0) {
    throw new AppError("This approval step has pending requests and cannot be deleted yet.", "APPROVAL_STEP_IN_USE", 409);
  }
  await repository.deleteStep(env, context.companyId, workflowId, stepId);
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_deleted",
    entityType: "approval_step",
    entityId: stepId,
    oldValueJson: JSON.stringify(step),
    reason,
  });
  return { id: stepId, deleted: true };
};

export const listThresholds = thresholdService.listThresholds;

export const getThreshold = async (env: Env, context: AuthActor, id: string) => {
  const threshold = await thresholdService.getThreshold(env, context.companyId, id);
  if (!threshold) throw new NotFoundError("Approval threshold not found.");
  return threshold;
};

export const createThreshold = async (env: Env, context: AuthActor, input: ThresholdInput) => {
  const id = crypto.randomUUID();
  await thresholdService.createThreshold(env, id, context.companyId, input);
  await thresholdService.createThresholdHistory(env, {
    id: crypto.randomUUID(),
    companyId: context.companyId,
    thresholdId: id,
    oldValue: null,
    newValue: input,
    changedBy: context.actorUserId,
    reason: input.reason,
  });
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_threshold_created",
    entityType: "approval_threshold",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  return getThreshold(env, context, id);
};

export const updateThreshold = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: Partial<ThresholdInput> & { reason?: string; is_active?: boolean },
) => {
  const old = await thresholdService.getThreshold(env, context.companyId, id);
  if (!old) throw new NotFoundError("Approval threshold not found.");
  await thresholdService.updateThreshold(env, context.companyId, id, input);
  const updated = await getThreshold(env, context, id);
  await thresholdService.createThresholdHistory(env, {
    id: crypto.randomUUID(),
    companyId: context.companyId,
    thresholdId: id,
    oldValue: old,
    newValue: updated,
    changedBy: context.actorUserId,
    reason: input.reason,
    status: input.is_active === false ? "disabled" : "active",
  });
  await auditOrFail(env, context, {
    module: "approvals",
    action: input.is_active === true ? "approval_threshold_enabled" : input.is_active === false ? "approval_threshold_disabled" : "approval_threshold_updated",
    entityType: "approval_threshold",
    entityId: id,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(updated),
    reason: input.reason,
  });
  return updated;
};

export const getThresholdHistory = async (env: Env, context: AuthActor, id: string) => {
  await getThreshold(env, context, id);
  return thresholdService.listThresholdHistory(env, context.companyId, id);
};

export const getSettingsSummary = async (env: Env, context: AuthActor) => {
  const [approvalMode, workflowsEnabled] = await Promise.all([
    settingsService.getApprovalMode(env, context.companyId),
    settingsService.areApprovalWorkflowsEnabled(env, context.companyId),
  ]);
  return {
    approval_mode: approvalMode,
    approval_workflows_enabled: workflowsEnabled,
    direct_admin_approval_enabled: approvalMode === "auto_admin_superadmin",
    disabled: approvalMode === "disabled" || !workflowsEnabled,
  };
};

export const getMyPendingCount = async (env: Env, context: AuthActor) => {
  const filters: ApprovalListFilters = {
    assigned_to_me: true,
    status: "pending",
    page: 1,
    page_size: 1,
    sort_by: "created_at",
    sort_direction: "desc",
  };
  const total = await repository.countRequests(env, context.companyId, filters, buildScope(context));
  return { pending_count: total };
};

export const parseDeleteReason = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") throw new ValidationError("A reason is required for this action.");
  const reason = (payload as Record<string, unknown>).reason;
  if (typeof reason !== "string" || reason.trim().length < 3) throw new ValidationError("A reason is required for this action.");
  return reason.trim();
};
