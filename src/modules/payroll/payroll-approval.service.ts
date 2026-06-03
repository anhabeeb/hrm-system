import * as repository from "./payroll.repository";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { ConflictError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

export const canDirectPayrollApprove = async (
  env: Env,
  context: AuthActor,
  permissionKey = "payroll.approve",
) => {
  const requiresApproval = await settingsService.shouldRequireApproval(
    env,
    context.companyId,
    "payroll_finalization",
    context,
  );
  return !requiresApproval && permissionService.hasPermission(context, permissionKey);
};

export const createApprovalRequest = async (
  env: Env,
  context: AuthActor,
  input: {
    workflowKey: string;
    module: string;
    entityType: string;
    entityId: string;
    summary: string;
    payload: Record<string, unknown>;
  },
) => {
  const requiresApproval = await settingsService.shouldRequireApproval(
    env,
    context.companyId,
    input.workflowKey,
    context,
  );
  if (!requiresApproval) return null;

  const workflow = await repository.findApprovalWorkflow(env, context.companyId, input.workflowKey);
  if (!workflow || workflow.is_enabled !== 1) {
    throw new ConflictError("Approval workflow is not configured for this payroll action.");
  }

  const id = createPrefixedId("approval_req");
  await repository.createApprovalWorkflowRequest(env, {
    id,
    companyId: context.companyId,
    workflowId: workflow.id,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    requestedBy: context.actorUserId,
    summary: input.summary,
    payloadJson: JSON.stringify(input.payload),
  });
  return id;
};
