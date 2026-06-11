import type { Context } from "hono";

import type { AppContext } from "../../types/api.types";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./approval-workflow-engine.service";

const auth = (c: Context<AppContext>) => c.get("authUser")!;
const param = (c: Context<AppContext>, name: string) => c.req.param(name) ?? "";
const body = async <T>(c: Context<AppContext>): Promise<T> => {
  try {
    return await c.req.json<T>();
  } catch {
    return {} as T;
  }
};

export const listWorkflows = async (c: Context<AppContext>) => {
  const result = await service.listWorkflows(c.env, auth(c), service.normalizeFilters(c.req.query()));
  return paginated(result.rows, result.pagination);
};

export const createWorkflow = async (c: Context<AppContext>) =>
  created(await service.createWorkflow(c.env, auth(c), await body(c)), "Approval workflow created.");

export const getWorkflow = async (c: Context<AppContext>) =>
  ok(await service.getWorkflow(c.env, auth(c), param(c, "workflowId")));

export const updateWorkflow = async (c: Context<AppContext>) =>
  ok(await service.updateWorkflow(c.env, auth(c), param(c, "workflowId"), await body(c)), "Approval workflow updated.");

export const activateWorkflow = async (c: Context<AppContext>) =>
  ok(await service.setWorkflowStatus(c.env, auth(c), param(c, "workflowId"), "ACTIVE"), "Approval workflow activated.");

export const deactivateWorkflow = async (c: Context<AppContext>) =>
  ok(await service.setWorkflowStatus(c.env, auth(c), param(c, "workflowId"), "INACTIVE"), "Approval workflow deactivated.");

export const archiveWorkflow = async (c: Context<AppContext>) => {
  const payload = await body<{ reason?: string }>(c);
  return ok(await service.archiveWorkflow(c.env, auth(c), param(c, "workflowId"), payload.reason), "Approval workflow archived.");
};

export const listWorkflowSteps = async (c: Context<AppContext>) =>
  ok(await service.listWorkflowSteps(c.env, auth(c), param(c, "workflowId")));

export const createWorkflowStep = async (c: Context<AppContext>) =>
  created(await service.createWorkflowStep(c.env, auth(c), param(c, "workflowId"), await body(c)), "Approval workflow step created.");

export const updateWorkflowStep = async (c: Context<AppContext>) =>
  ok(await service.updateWorkflowStep(c.env, auth(c), param(c, "workflowId"), param(c, "stepId"), await body(c)), "Approval workflow step updated.");

export const disableWorkflowStep = async (c: Context<AppContext>) =>
  ok(await service.setWorkflowStepActive(c.env, auth(c), param(c, "workflowId"), param(c, "stepId"), false), "Approval workflow step disabled.");

export const enableWorkflowStep = async (c: Context<AppContext>) =>
  ok(await service.setWorkflowStepActive(c.env, auth(c), param(c, "workflowId"), param(c, "stepId"), true), "Approval workflow step enabled.");

export const reorderWorkflowSteps = async (c: Context<AppContext>) => {
  const payload = await body<{ steps?: Array<{ id: string; step_order: number }> }>(c);
  return ok(await service.reorderWorkflowSteps(c.env, auth(c), param(c, "workflowId"), payload.steps ?? []), "Approval workflow steps reordered.");
};

export const listRequests = async (c: Context<AppContext>) => {
  const result = await service.listRequests(c.env, auth(c), service.normalizeFilters(c.req.query()));
  return paginated(result.rows, result.pagination);
};

export const createApprovalRequest = async (c: Context<AppContext>) =>
  created(await service.createApprovalRequestDraft(c.env, auth(c), await body(c)), "Approval request draft created.");

export const getApprovalRequest = async (c: Context<AppContext>) =>
  ok((await service.getTimeline(c.env, auth(c), param(c, "id"))).request);

export const submitApprovalRequest = async (c: Context<AppContext>) =>
  ok(await service.submitApprovalRequest(c.env, auth(c), param(c, "id")), "Approval request submitted.");

export const cancelApprovalRequest = async (c: Context<AppContext>) => {
  const payload = await body<{ reason?: string }>(c);
  return ok(await service.cancelRequest(c.env, auth(c), param(c, "id"), payload.reason), "Approval request cancelled.");
};

export const approveApprovalRequest = async (c: Context<AppContext>) => {
  const payload = await body<{ comment?: string }>(c);
  return ok(await service.approveStep(c.env, auth(c), param(c, "id"), payload.comment), "Approval request approved.");
};

export const rejectApprovalRequest = async (c: Context<AppContext>) => {
  const payload = await body<{ reason?: string; comment?: string }>(c);
  return ok(await service.rejectStep(c.env, auth(c), param(c, "id"), payload.reason ?? "", payload.comment), "Approval request rejected.");
};

export const escalateApprovalRequest = async (c: Context<AppContext>) => {
  const payload = await body<{ reason?: string }>(c);
  return ok(await service.escalateRequest(c.env, auth(c), param(c, "id"), payload.reason ?? ""), "Approval request escalated.");
};

export const assignApprovalRequestStep = async (c: Context<AppContext>) => {
  const payload = await body<{ user_id?: string; reason?: string }>(c);
  return ok(
    await service.assignApprover(c.env, auth(c), param(c, "id"), param(c, "stepId"), payload.user_id ?? "", payload.reason ?? ""),
    "Approver assigned.",
  );
};

export const getApprovalRequestTimeline = async (c: Context<AppContext>) =>
  ok(await service.getTimeline(c.env, auth(c), param(c, "id")));

export const getMyPending = async (c: Context<AppContext>) => {
  const result = await service.getMyPending(c.env, auth(c), service.normalizeFilters(c.req.query()));
  return paginated(result.rows, result.pagination);
};

export const getMyRequests = async (c: Context<AppContext>) => {
  const result = await service.getMyRequests(c.env, auth(c), service.normalizeFilters(c.req.query()));
  return paginated(result.rows, result.pagination);
};

export const seedDefaultWorkflowTemplate = async (c: Context<AppContext>) => {
  const payload = await body<{ operation_type?: "LEAVE_REQUEST" | "ATTENDANCE_CORRECTION" | "ROSTER_CHANGE" | "EMPLOYEE_DOCUMENT_UPDATE" }>(c);
  return created(await service.seedDefaultWorkflowTemplate(c.env, auth(c), payload.operation_type ?? "LEAVE_REQUEST"), "Default workflow template prepared.");
};
