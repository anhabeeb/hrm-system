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

export interface ApprovalThresholdEligibility {
  required_roles_json?: string | null;
  required_permissions_json?: string | null;
}

const parseList = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
};

export const canActorApproveStep = (
  context: AuthActor,
  step?: ApprovalStepRecord | null,
  threshold?: ApprovalThresholdEligibility | null,
): boolean => {
  if (permissionService.isSuperAdmin(context)) {
    return true;
  }

  const roleAllowed = step?.required_role_key ? context.roleKeys.includes(step.required_role_key) : true;
  const permissionAllowed = step?.required_permission_key ? permissionService.hasPermission(context, step.required_permission_key) : true;
  const thresholdRoles = parseList(threshold?.required_roles_json);
  const thresholdPermissions = parseList(threshold?.required_permissions_json);
  const thresholdRoleAllowed = thresholdRoles.length === 0 || thresholdRoles.some((roleKey) => context.roleKeys.includes(roleKey));
  const thresholdPermissionAllowed = thresholdPermissions.length === 0 || thresholdPermissions.some((permissionKey) => permissionService.hasPermission(context, permissionKey));

  return roleAllowed && permissionAllowed && thresholdRoleAllowed && thresholdPermissionAllowed;
};

export const findNextRequiredStep = (
  steps: ApprovalStepRecord[],
  currentStep: number,
): ApprovalStepRecord | undefined =>
  steps
    .filter((step) => step.is_required !== 0 && step.step_order > currentStep)
    .sort((a, b) => a.step_order - b.step_order)[0];
