import type { AuthActor } from "../../types/api.types";
import * as permissionService from "../../services/permission.service";

export interface ApprovalStepRecord {
  step_order: number;
  step_name?: string;
  required_role_key?: string | null;
  required_permission_key?: string | null;
  is_required?: number;
  amount_min?: number | null;
  amount_max?: number | null;
}

export const canActorApproveStep = (context: AuthActor, step?: ApprovalStepRecord | null): boolean => {
  if (permissionService.isSuperAdmin(context)) {
    return true;
  }

  if (!step) {
    return true;
  }

  const roleAllowed = step.required_role_key ? context.roleKeys.includes(step.required_role_key) : true;
  const permissionAllowed = step.required_permission_key ? permissionService.hasPermission(context, step.required_permission_key) : true;

  return roleAllowed && permissionAllowed;
};

export const findNextRequiredStep = (
  steps: ApprovalStepRecord[],
  currentStep: number,
): ApprovalStepRecord | undefined =>
  steps
    .filter((step) => step.is_required !== 0 && step.step_order > currentStep)
    .sort((a, b) => a.step_order - b.step_order)[0];
