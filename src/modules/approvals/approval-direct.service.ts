import type { AuthActor } from "../../types/api.types";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";

export interface ApprovalDirectDecision {
  approval_required: boolean;
  direct_action_allowed: boolean;
  approval_mode: string;
  reason: string;
}

export const getApprovalDirectDecision = async (
  env: Env,
  companyId: string,
  context: AuthActor,
  workflowMode?: string | null,
): Promise<ApprovalDirectDecision> => {
  const workflowsEnabled = await settingsService.areApprovalWorkflowsEnabled(env, companyId);
  const approvalMode = workflowMode ?? await settingsService.getApprovalMode(env, companyId);

  if (!workflowsEnabled || approvalMode === "disabled") {
    return {
      approval_required: false,
      direct_action_allowed: true,
      approval_mode: approvalMode,
      reason: "Approval workflows are disabled.",
    };
  }

  if (approvalMode === "auto_admin_superadmin" && permissionService.isAdminOrSuperAdmin(context)) {
    return {
      approval_required: false,
      direct_action_allowed: true,
      approval_mode: approvalMode,
      reason: "Authorized Admin or Super Admin can approve directly.",
    };
  }

  return {
    approval_required: true,
    direct_action_allowed: false,
    approval_mode: approvalMode,
    reason: "Approval workflow is required.",
  };
};
