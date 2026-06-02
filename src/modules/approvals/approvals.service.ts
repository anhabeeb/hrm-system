import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as realtimeService from "../../services/realtime.service";
import * as settingsService from "../../services/settings.service";
import { AppError, NotFoundError, OutletAccessError, PermissionError, ReasonRequiredError, ValidationError } from "../../utils/errors";

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
  ApprovalRequestCreateInput,
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

const thresholdFromPayload = (payloadJson: string | null | undefined) => {
  const payload = parseJson<Record<string, unknown>>(payloadJson, {});
  const threshold = payload.approval_threshold;
  if (!threshold || typeof threshold !== "object") return null;
  return threshold as { required_roles_json?: string | null; required_permissions_json?: string | null; threshold_id?: string; threshold_name?: string };
};

const thresholdList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const requestToResponse = async (env: Env, context: AuthActor, request: any) => {
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  const threshold = thresholdFromPayload(request.payload_json);
  const actionable = !["approved", "rejected", "returned", "returned_for_more_info", "cancelled"].includes(request.status);
  const assigned = canActorApproveStep(context, step, threshold);
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
    waiting_for_role_key: request.waiting_for_role_key ?? step?.required_role_key ?? thresholdList(threshold?.required_roles_json)[0] ?? null,
    waiting_for_permission_key: request.waiting_for_permission_key ?? step?.required_permission_key ?? thresholdList(threshold?.required_permissions_json)[0] ?? null,
    threshold: threshold ? {
      threshold_id: threshold.threshold_id ?? null,
      threshold_name: threshold.threshold_name ?? null,
      required_roles: thresholdList(threshold.required_roles_json),
      required_permissions: thresholdList(threshold.required_permissions_json),
    } : null,
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

const canUserAccessApproval = (context: AuthActor, request: any, step: any, purpose: "view" | "act"): boolean => {
  if (permissionService.isSuperAdmin(context)) return true;
  const threshold = thresholdFromPayload(request.payload_json);
  const eligibleStepApprover = canActorApproveStep(context, step, threshold);
  if (purpose === "view" && request.requested_by === context.actorUserId) return true;
  if (request.outlet_id || request.employee_id) {
    return Boolean(request.outlet_id && context.outletIds.includes(request.outlet_id));
  }
  return eligibleStepApprover;
};

const assertAccess = (context: AuthActor, request: any, step: any, purpose: "view" | "act" = "view"): void => {
  if (canUserAccessApproval(context, request, step, purpose)) return;
  throw new OutletAccessError("You do not have access to this approval request.");
};

const assertCurrentStepAccess = (context: AuthActor, step: any, request: any): void => {
  if (!canActorApproveStep(context, step, thresholdFromPayload(request.payload_json))) {
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
  const candidates = await repository.listRequestCandidates(env, context.companyId, filters);
  const accessible: any[] = [];
  for (const row of candidates) {
    const step = await repository.findStep(env, context.companyId, row.workflow_id, Number(row.current_step ?? 1));
    if (canUserAccessApproval(context, row, step, "view")) {
      if (!filters.assigned_to_me || canActorApproveStep(context, step, thresholdFromPayload(row.payload_json))) {
        accessible.push(row);
      }
    }
  }
  const total = accessible.length;
  const rows = accessible.slice((filters.page - 1) * filters.page_size, filters.page * filters.page_size);
  return {
    rows: await Promise.all(rows.map((row) => requestToResponse(env, context, row))),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getApprovalRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  assertAccess(context, request, step, "view");
  return requestToResponse(env, context, request);
};

export const getApprovalHistory = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("Approval request not found.");
  const step = await repository.findStep(env, context.companyId, request.workflow_id, Number(request.current_step ?? 1));
  assertAccess(context, request, step, "view");
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
  assertAccess(context, request, currentStep, "act");
  assertApprovalIsActionable(request.status);
  assertNotSelfApproval(request.requested_by, context.actorUserId);
  assertCurrentStepAccess(context, currentStep, request);

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
  await repository.runApprovalActionStatements(env, {
    actionId: crypto.randomUUID(),
    companyId: context.companyId,
    requestId: id,
    stepOrder: Number(request.current_step ?? 1),
    action,
    actedBy: context.actorUserId,
    comment: input.comment ?? input.reason,
    oldStatus,
    newStatus,
    currentStep: nextStep,
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

const findMatchingThreshold = async (
  env: Env,
  companyId: string,
  workflowKey: string,
  amount?: number,
  currency?: string,
) => {
  if (amount === undefined) return null;
  const today = new Date().toISOString().slice(0, 10);
  const thresholds = await repository.listActiveThresholdsForWorkflow(env, companyId, workflowKey, today);
  const matches = thresholds.filter((threshold) => {
    if (threshold.currency && currency && threshold.currency !== currency) return false;
    if (threshold.amount_min !== null && threshold.amount_min !== undefined && amount < Number(threshold.amount_min)) return false;
    if (threshold.amount_max !== null && threshold.amount_max !== undefined && amount > Number(threshold.amount_max)) return false;
    return true;
  });
  return matches.sort((a, b) => {
    const aWidth = (a.amount_max ?? Number.MAX_SAFE_INTEGER) - (a.amount_min ?? 0);
    const bWidth = (b.amount_max ?? Number.MAX_SAFE_INTEGER) - (b.amount_min ?? 0);
    if (aWidth !== bWidth) return aWidth - bWidth;
    return String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? ""));
  })[0] ?? null;
};

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
  await repository.runApprovalActionStatements(env, {
    actionId: crypto.randomUUID(),
    companyId: context.companyId,
    requestId: id,
    stepOrder: Number(request.current_step ?? 1),
    action: `override_${input.decision}`,
    actedBy: context.actorUserId,
    comment: input.comment ?? input.reason,
    oldStatus: request.status,
    newStatus,
  });
  await broadcastSafe(env, context.companyId, "approval.override", { approval_request_id: id, status: newStatus }, context.actorUserId);
  return { approval_request_id: id, status: newStatus, ...integration };
};

export const createApprovalRequestForWorkflow = async (
  env: Env,
  context: AuthActor,
  input: ApprovalRequestCreateInput,
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
  const threshold = await findMatchingThreshold(env, context.companyId, input.workflowKey, input.amount, input.currency);
  const payload = {
    ...(input.payload ?? {}),
    ...(threshold ? {
      approval_threshold: {
        threshold_id: threshold.id,
        threshold_name: threshold.threshold_name,
        required_roles_json: threshold.required_roles_json,
        required_permissions_json: threshold.required_permissions_json,
        amount: input.amount,
        currency: input.currency ?? threshold.currency ?? null,
      },
    } : {}),
  };
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_request_created",
    severity: "info",
    entityType: "approval_request",
    entityId: id,
    employeeId: input.employeeId ?? undefined,
    newValueJson: JSON.stringify({ workflow_key: input.workflowKey, module: input.module, entity_type: input.entityType, threshold_id: threshold?.id ?? null }),
    approvalRequestId: id,
  });
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
    payloadJson: JSON.stringify(sanitizePayload(payload)),
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
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_workflow_created",
    entityType: "approval_workflow",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  await workflowService.createWorkflow(env, id, context.companyId, input);
  return getWorkflow(env, context, id);
};

export const updateWorkflow = async (env: Env, context: AuthActor, id: string, input: WorkflowUpdateInput) => {
  const old = await repository.findWorkflowById(env, context.companyId, id);
  if (!old) throw new NotFoundError("Approval workflow not found.");
  const sensitiveChanged = (
    (input.workflow_key !== undefined && input.workflow_key !== old.workflow_key) ||
    (input.module !== undefined && input.module !== old.module) ||
    (input.approval_mode !== undefined && input.approval_mode !== old.approval_mode) ||
    (input.is_enabled !== undefined && Number(input.is_enabled ? 1 : 0) !== Number(old.is_enabled))
  );
  if (sensitiveChanged && (!input.reason || input.reason.trim().length < 3)) {
    throw new ReasonRequiredError("A reason is required for this action.");
  }
  if (input.workflow_key !== undefined && input.workflow_key !== old.workflow_key) {
    const openRequests = await repository.countOpenRequestsForWorkflow(env, context.companyId, id);
    if (openRequests > 0) {
      throw new AppError("This workflow has pending approval requests and cannot be renamed yet.", "WORKFLOW_HAS_OPEN_REQUESTS", 409);
    }
  }
  await auditOrFail(env, context, {
    module: "approvals",
    action: input.is_enabled === true ? "approval_workflow_enabled" : input.is_enabled === false ? "approval_workflow_disabled" : "approval_workflow_updated",
    entityType: "approval_workflow",
    entityId: id,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  await workflowService.updateWorkflow(env, context.companyId, id, input);
  return getWorkflow(env, context, id);
};

export const createWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, input: StepInput) => {
  const workflow = await repository.findWorkflowById(env, context.companyId, workflowId);
  if (!workflow) throw new NotFoundError("Approval workflow not found.");
  const duplicate = await repository.findStepByOrder(env, context.companyId, workflowId, input.step_order);
  if (duplicate) {
    throw new AppError("This workflow already has a step with this order.", "DUPLICATE_APPROVAL_STEP_ORDER", 409);
  }
  const id = crypto.randomUUID();
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_created",
    entityType: "approval_step",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  await repository.createStep(env, id, context.companyId, workflowId, input);
  return repository.findStepById(env, context.companyId, workflowId, id);
};

export const updateWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, stepId: string, input: StepInput) => {
  const old = await repository.findStepById(env, context.companyId, workflowId, stepId);
  if (!old) throw new NotFoundError("Approval step not found.");
  const duplicate = await repository.findStepByOrder(env, context.companyId, workflowId, input.step_order, stepId);
  if (duplicate) {
    throw new AppError("This workflow already has a step with this order.", "DUPLICATE_APPROVAL_STEP_ORDER", 409);
  }
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_updated",
    entityType: "approval_step",
    entityId: stepId,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
  await repository.updateStep(env, context.companyId, workflowId, stepId, input);
  return repository.findStepById(env, context.companyId, workflowId, stepId);
};

export const deleteWorkflowStep = async (env: Env, context: AuthActor, workflowId: string, stepId: string, reason: string) => {
  const step = await repository.findStepById(env, context.companyId, workflowId, stepId);
  if (!step) throw new NotFoundError("Approval step not found.");
  const pending = await repository.countPendingRequestsAtStep(env, context.companyId, workflowId, Number(step.step_order));
  if (pending > 0) {
    throw new AppError("This approval step has pending requests and cannot be deleted yet.", "APPROVAL_STEP_IN_USE", 409);
  }
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_step_deleted",
    entityType: "approval_step",
    entityId: stepId,
    oldValueJson: JSON.stringify(step),
    reason,
  });
  await repository.deleteStep(env, context.companyId, workflowId, stepId);
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
  await auditOrFail(env, context, {
    module: "approvals",
    action: "approval_threshold_created",
    entityType: "approval_threshold",
    entityId: id,
    newValueJson: JSON.stringify(input),
    reason: input.reason,
  });
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
  const intended = { ...old, ...input, is_active: input.is_active === undefined ? old.is_active : input.is_active ? 1 : 0 };
  await auditOrFail(env, context, {
    module: "approvals",
    action: input.is_active === true ? "approval_threshold_enabled" : input.is_active === false ? "approval_threshold_disabled" : "approval_threshold_updated",
    entityType: "approval_threshold",
    entityId: id,
    oldValueJson: JSON.stringify(old),
    newValueJson: JSON.stringify(intended),
    reason: input.reason,
  });
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
  const result = await listApprovalRequests(env, context, filters);
  return { pending_count: result.pagination.total };
};

export const parseDeleteReason = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") throw new ValidationError("A reason is required for this action.");
  const reason = (payload as Record<string, unknown>).reason;
  if (typeof reason !== "string" || reason.trim().length < 3) throw new ValidationError("A reason is required for this action.");
  return reason.trim();
};
