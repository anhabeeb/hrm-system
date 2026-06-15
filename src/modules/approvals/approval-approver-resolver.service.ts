import * as repository from "./approval-workflow-engine.repository";
import * as operationOwnershipRepository from "../operation-ownership/operation-ownership.repository";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import type {
  ApprovalRequestEngineRecord,
  ApprovalResolverCandidate,
  ApprovalResolverResult,
  ApprovalWorkflowStepEngineRecord,
} from "./approval-workflow-engine.types";

const removeSelf = (
  candidates: ApprovalResolverCandidate[],
  request: ApprovalRequestEngineRecord,
  allowSelfApproval: boolean,
) => {
  if (allowSelfApproval) return candidates;
  return candidates.filter(
    (candidate) =>
      candidate.user_id !== request.requester_user_id &&
      (!request.requester_employee_id || candidate.employee_id !== request.requester_employee_id),
  );
};

const withFallback = (
  step: ApprovalWorkflowStepEngineRecord,
  message: string,
): ApprovalResolverResult => {
  if (step.fallback_behavior === "SKIP_TO_HR") {
    return { candidates: [], assignedApprover: null, status: "SKIPPED", fallbackApplied: "SKIP_TO_HR", message };
  }
  if (step.fallback_behavior === "ESCALATE_TO_SUPER_ADMIN") {
    return { candidates: [], assignedApprover: null, status: "ESCALATED", fallbackApplied: "ESCALATE_TO_SUPER_ADMIN", message };
  }
  if (step.fallback_behavior === "HOLD_FOR_MANUAL_ASSIGNMENT") {
    return { candidates: [], assignedApprover: null, status: "WAITING_FOR_APPROVER", fallbackApplied: "HOLD_FOR_MANUAL_ASSIGNMENT", message };
  }
  return { candidates: [], assignedApprover: null, status: "BLOCKED", fallbackApplied: "BLOCK_SUBMISSION", message };
};

const resolved = (candidates: ApprovalResolverCandidate[]): ApprovalResolverResult => ({
  candidates,
  assignedApprover: candidates[0] ?? null,
  status: "RESOLVED",
  fallbackApplied: null,
  message: candidates[0] ? "Approver resolved." : "No approver found.",
});

const isOperationOwnershipResolver = (resolverType: string) =>
  resolverType === "OPERATION_OWNER" ||
  resolverType === "OPERATION_FINAL_APPROVER" ||
  resolverType === "OPERATION_EXECUTOR" ||
  resolverType === "OPERATION_CONFIGURATION_OWNER" ||
  resolverType === "OPERATION_ESCALATION" ||
  resolverType === "BUSINESS_FUNCTION_DEPARTMENT";

const operationResponsibilityType = (resolverType: string) => {
  if (resolverType === "OPERATION_FINAL_APPROVER") return "FINAL_APPROVAL" as const;
  if (resolverType === "OPERATION_EXECUTOR") return "EXECUTION" as const;
  if (resolverType === "OPERATION_CONFIGURATION_OWNER") return "CONFIGURATION" as const;
  if (resolverType === "OPERATION_ESCALATION") return "ESCALATION" as const;
  return "OWNER" as const;
};

const candidatesFromOperationOwnership = async (
  env: Env,
  request: ApprovalRequestEngineRecord,
  step: ApprovalWorkflowStepEngineRecord,
) => {
  const resolution = await resolveOperationResponsibility(env, { companyId: request.company_id }, {
    operation_code: request.operation_type,
    responsibility_type: operationResponsibilityType(step.approver_resolver_type),
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.subject_employee_id,
    department_id: request.department_id,
    fallback_behavior: step.fallback_behavior === "ESCALATE_TO_SUPER_ADMIN" ? "USE_SUPER_ADMIN" : step.fallback_behavior === "BLOCK_SUBMISSION" ? "BLOCK_OPERATION" : "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

  if (resolution.resolved_user_id) {
    return repository.findSpecificUserApprover(env, request.company_id, resolution.resolved_user_id);
  }
  if (resolution.resolved_department_id) {
    return operationOwnershipRepository.listDepartmentApproversForOperation(
      env,
      request.company_id,
      resolution.resolved_department_id,
      {
        permissionKey: step.required_permission ?? resolution.required_permission,
        roleId: step.required_role_id ?? resolution.required_role_id,
        minLevel: step.required_min_level ?? resolution.min_level,
        maxLevel: step.required_max_level ?? resolution.max_level,
      },
    );
  }
  if (resolution.required_role_id || resolution.required_permission) {
    return repository.findPermissionApprovers(env, request.company_id, {
      departmentId: resolution.resolved_department_id ?? step.required_department_id,
      roleId: step.required_role_id ?? resolution.required_role_id,
      permission: step.required_permission ?? resolution.required_permission,
    });
  }
  return [];
};

export const resolveApproversForStep = async (
  env: Env,
  request: ApprovalRequestEngineRecord,
  step: ApprovalWorkflowStepEngineRecord,
): Promise<ApprovalResolverResult> => {
  if (step.approver_resolver_type === "MANUAL_ASSIGNMENT") {
    return withFallback({ ...step, fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT" }, "Manual approver assignment is required.");
  }

  let candidates: ApprovalResolverCandidate[] = [];
  const departmentId = step.required_department_id ?? request.department_id;

  if (step.approver_resolver_type === "DEPARTMENT_HEAD" && departmentId) {
    candidates = await repository.findDepartmentHeadApprover(env, request.company_id, departmentId, step.required_permission);
  } else if (step.approver_resolver_type === "DEPARTMENT_LEVEL" && departmentId) {
    candidates = await repository.findDepartmentLevelApprovers(env, request.company_id, {
      departmentId,
      minLevel: step.required_min_level,
      maxLevel: step.required_max_level,
      requiredPermission: step.required_permission,
    });
  } else if (step.approver_resolver_type === "DEPARTMENT_ROLE" && departmentId) {
    candidates = await repository.findPermissionApprovers(env, request.company_id, {
      departmentId,
      roleId: step.required_role_id,
      permission: step.required_permission,
    });
  } else if (step.approver_resolver_type === "HR_FINAL_APPROVER") {
    candidates = await repository.findPermissionApprovers(env, request.company_id, {
      permission: step.required_permission ?? "approvals.hrFinal.approve",
    });
  } else if (step.approver_resolver_type === "FINANCE_FINAL_APPROVER") {
    candidates = await repository.findPermissionApprovers(env, request.company_id, {
      permission: step.required_permission ?? "approvals.financeFinal.approve",
    });
  } else if (step.approver_resolver_type === "ROLE_PERMISSION") {
    candidates = await repository.findPermissionApprovers(env, request.company_id, {
      permission: step.required_permission,
      roleId: step.required_role_id,
      departmentId: step.required_department_id,
    });
  } else if (step.approver_resolver_type === "SPECIFIC_USER" && step.specific_user_id) {
    candidates = await repository.findSpecificUserApprover(env, request.company_id, step.specific_user_id);
  } else if (step.approver_resolver_type === "SUPER_ADMIN") {
    candidates = await repository.findSuperAdminApprovers(env, request.company_id);
  } else if (isOperationOwnershipResolver(step.approver_resolver_type)) {
    candidates = await candidatesFromOperationOwnership(env, request, step);
  }

  const eligible = removeSelf(candidates, request, step.allow_self_approval === 1);
  if (eligible.length > 0) return resolved(eligible);

  return withFallback(step, `No eligible approver was found for ${step.step_name}.`);
};
