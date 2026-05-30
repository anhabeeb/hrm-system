import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

import * as service from "./approvals.service";
import {
  validateApprovalAction,
  validateApprovalFilters,
  validateOverrideAction,
  validateStepInput,
  validateThresholdFilters,
  validateThresholdInput,
  validateThresholdUpdate,
  validateWorkflowCreate,
  validateWorkflowFilters,
  validateWorkflowUpdate,
} from "./approvals.validators";

const auth = (c: Context<AppContext>): AuthActor => c.get("authUser") as AuthActor;
const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const param = (c: Context<AppContext>, key: string): string => {
  const value = c.req.param(key);
  if (!value) throw new ValidationError("The requested approval record could not be identified.");
  return value;
};

export const listApprovals = async (c: Context<AppContext>) => {
  const filters = validateApprovalFilters(c.req.query());
  const result = await service.listApprovalRequests(c.env, auth(c), filters);
  return paginated(result.rows, result.pagination, "Approval requests loaded successfully.", requestId(c));
};

export const getApproval = async (c: Context<AppContext>) =>
  ok(await service.getApprovalRequest(c.env, auth(c), param(c, "id")), "Approval request loaded successfully.", requestId(c));

export const approveApproval = async (c: Context<AppContext>) => {
  const result = await service.approveApprovalRequest(c.env, auth(c), param(c, "id"), validateApprovalAction(await json(c)));
  return ok(result, result.message, requestId(c));
};

export const rejectApproval = async (c: Context<AppContext>) => {
  const result = await service.rejectApprovalRequest(c.env, auth(c), param(c, "id"), validateApprovalAction(await json(c)));
  return ok(result, result.message, requestId(c));
};

export const returnApproval = async (c: Context<AppContext>) => {
  const result = await service.returnApprovalRequest(c.env, auth(c), param(c, "id"), validateApprovalAction(await json(c)));
  return ok(result, result.message, requestId(c));
};

export const overrideApproval = async (c: Context<AppContext>) =>
  ok(await service.overrideApprovalRequest(c.env, auth(c), param(c, "id"), validateOverrideAction(await json(c))), "Approval request overridden.", requestId(c));

export const getHistory = async (c: Context<AppContext>) =>
  ok(await service.getApprovalHistory(c.env, auth(c), param(c, "id")), "Approval history loaded successfully.", requestId(c));

export const listWorkflows = async (c: Context<AppContext>) => {
  const filters = validateWorkflowFilters(c.req.query());
  const result = await service.listWorkflows(c.env, auth(c).companyId, filters);
  return paginated(result.rows, result.pagination, "Approval workflows loaded successfully.", requestId(c));
};

export const getWorkflow = async (c: Context<AppContext>) =>
  ok(await service.getWorkflow(c.env, auth(c), param(c, "workflowId")), "Approval workflow loaded successfully.", requestId(c));

export const createWorkflow = async (c: Context<AppContext>) =>
  created(await service.createWorkflow(c.env, auth(c), validateWorkflowCreate(await json(c))), "Approval workflow created successfully.", requestId(c));

export const updateWorkflow = async (c: Context<AppContext>) =>
  ok(await service.updateWorkflow(c.env, auth(c), param(c, "workflowId"), validateWorkflowUpdate(await json(c))), "Approval workflow updated successfully.", requestId(c));

export const enableWorkflow = async (c: Context<AppContext>) => {
  const payload = await json(c);
  const reason = service.parseDeleteReason(payload);
  return ok(await service.updateWorkflow(c.env, auth(c), param(c, "workflowId"), { is_enabled: true, reason }), "Approval workflow enabled successfully.", requestId(c));
};

export const disableWorkflow = async (c: Context<AppContext>) => {
  const payload = await json(c);
  const reason = service.parseDeleteReason(payload);
  return ok(await service.updateWorkflow(c.env, auth(c), param(c, "workflowId"), { is_enabled: false, reason }), "Approval workflow disabled successfully.", requestId(c));
};

export const listWorkflowSteps = async (c: Context<AppContext>) => {
  const workflow = await service.getWorkflow(c.env, auth(c), param(c, "workflowId"));
  return ok(workflow.steps ?? [], "Approval workflow steps loaded successfully.", requestId(c));
};

export const createWorkflowStep = async (c: Context<AppContext>) =>
  created(await service.createWorkflowStep(c.env, auth(c), param(c, "workflowId"), validateStepInput(await json(c))), "Approval step created successfully.", requestId(c));

export const updateWorkflowStep = async (c: Context<AppContext>) =>
  ok(await service.updateWorkflowStep(c.env, auth(c), param(c, "workflowId"), param(c, "stepId"), validateStepInput(await json(c))), "Approval step updated successfully.", requestId(c));

export const deleteWorkflowStep = async (c: Context<AppContext>) =>
  ok(await service.deleteWorkflowStep(c.env, auth(c), param(c, "workflowId"), param(c, "stepId"), service.parseDeleteReason(await json(c))), "Approval step deleted successfully.", requestId(c));

export const listThresholds = async (c: Context<AppContext>) => {
  const filters = validateThresholdFilters(c.req.query());
  const result = await service.listThresholds(c.env, auth(c).companyId, filters);
  return paginated(result.rows, result.pagination, "Approval thresholds loaded successfully.", requestId(c));
};

export const getThreshold = async (c: Context<AppContext>) =>
  ok(await service.getThreshold(c.env, auth(c), param(c, "thresholdId")), "Approval threshold loaded successfully.", requestId(c));

export const createThreshold = async (c: Context<AppContext>) =>
  created(await service.createThreshold(c.env, auth(c), validateThresholdInput(await json(c))), "Approval threshold created successfully.", requestId(c));

export const updateThreshold = async (c: Context<AppContext>) =>
  ok(await service.updateThreshold(c.env, auth(c), param(c, "thresholdId"), validateThresholdUpdate(await json(c))), "Approval threshold updated successfully.", requestId(c));

export const enableThreshold = async (c: Context<AppContext>) =>
  ok(await service.updateThreshold(c.env, auth(c), param(c, "thresholdId"), { is_active: true, reason: service.parseDeleteReason(await json(c)) }), "Approval threshold enabled successfully.", requestId(c));

export const disableThreshold = async (c: Context<AppContext>) =>
  ok(await service.updateThreshold(c.env, auth(c), param(c, "thresholdId"), { is_active: false, reason: service.parseDeleteReason(await json(c)) }), "Approval threshold disabled successfully.", requestId(c));

export const getThresholdHistory = async (c: Context<AppContext>) =>
  ok(await service.getThresholdHistory(c.env, auth(c), param(c, "thresholdId")), "Approval threshold history loaded successfully.", requestId(c));

export const getSettingsSummary = async (c: Context<AppContext>) =>
  ok(await service.getSettingsSummary(c.env, auth(c)), "Approval settings summary loaded successfully.", requestId(c));

export const getMyPendingCount = async (c: Context<AppContext>) =>
  ok(await service.getMyPendingCount(c.env, auth(c)), "Pending approval count loaded successfully.", requestId(c));
