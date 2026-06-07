import type { AuthActor } from "../../types/api.types";

export interface ApprovalIntegrationResult {
  target_update_applied: boolean;
  target_update_note: string;
  target_result?: unknown;
}

export const applyApprovedTargetChange = async (
  env: Env,
  context: AuthActor,
  request: { id: string; module: string; entity_type: string; entity_id: string; payload_json?: string | null },
): Promise<ApprovalIntegrationResult> => {
  if (request.module === "salary" && request.entity_type !== "promotion_with_salary_change") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.applyApprovedSalaryApproval(env, context, request);
    return {
      target_update_applied: true,
      target_update_note: "Approved salary change was applied.",
      target_result: target,
    };
  }

  if (request.module === "salary" && request.entity_type === "promotion_with_salary_change") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.applyApprovedJobSalaryApproval(env, context, request);
    return {
      target_update_applied: true,
      target_update_note: "Approved promotion and salary change were applied.",
      target_result: target,
    };
  }

  if (request.module === "compensation") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.applyApprovedCompensationApproval(env, context, request);
    return {
      target_update_applied: true,
      target_update_note: "Approved compensation component change was applied.",
      target_result: target,
    };
  }

  return {
    target_update_applied: false,
    target_update_note: "The approval was recorded. The target module must apply the approved change.",
  };
};

export const findAppliedTargetChange = async (
  env: Env,
  context: AuthActor,
  request: { id: string; module: string; entity_type: string; entity_id: string; payload_json?: string | null },
): Promise<ApprovalIntegrationResult | null> => {
  if (request.module === "salary" && request.entity_type !== "promotion_with_salary_change") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.findAppliedSalaryApproval(env, context, request);
    return target ? {
      target_update_applied: true,
      target_update_note: "Approved salary change was already applied.",
      target_result: target,
    } : null;
  }

  if (request.module === "salary" && request.entity_type === "promotion_with_salary_change") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.findAppliedJobSalaryApproval(env, context, request);
    return target ? {
      target_update_applied: true,
      target_update_note: "Approved promotion and salary change were already applied.",
      target_result: target,
    } : null;
  }

  if (request.module === "compensation") {
    const employeeService = await import("../employees/employees.service");
    const target = await employeeService.findAppliedCompensationApproval(env, context, request);
    return target ? {
      target_update_applied: true,
      target_update_note: "Approved compensation component change was already applied.",
      target_result: target,
    } : null;
  }

  return null;
};

export const applyRejectedTargetChange = async (
  _env: Env,
  _request: { module: string; entity_type: string; entity_id: string },
): Promise<ApprovalIntegrationResult> => ({
  target_update_applied: false,
  target_update_note: "The approval decision was recorded. The target module can keep or update its own status safely.",
});
