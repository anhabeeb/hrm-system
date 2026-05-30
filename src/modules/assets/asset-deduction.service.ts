import * as repository from "./assets.repository";
import type { AssetDeductionRequestInput, AssetMarkInput } from "./assets.types";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, ConflictError, LockedRecordError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

export const assertDeductionMonthUnlocked = async (env: Env, companyId: string, deductionMonth?: string) => {
  if (!deductionMonth) return;
  const run = await repository.findPayrollRun(env, companyId, deductionMonth);
  if (run && ["locked", "paid"].includes(run.status)) {
    throw new LockedRecordError("This deduction affects a locked payroll period.");
  }
};

const reasonPayload = (reason: string, deductionMonth?: string) =>
  JSON.stringify({ reason, deduction_month: deductionMonth ?? null });

export const parseDeductionReason = (value: string | null | undefined) => {
  if (!value) return { reason: "", deduction_month: null as string | null };
  try {
    const parsed = JSON.parse(value) as { reason?: unknown; deduction_month?: unknown };
    return {
      reason: typeof parsed.reason === "string" ? parsed.reason : value,
      deduction_month: typeof parsed.deduction_month === "string" ? parsed.deduction_month : null,
    };
  } catch {
    return { reason: value, deduction_month: null as string | null };
  }
};

const createApprovalIfRequired = async (
  env: Env,
  context: AuthActor,
  deductionId: string,
  employeeId: string,
  payload: Record<string, unknown>,
) => {
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "asset_deduction", context);
  if (!requiresApproval) return null;
  const workflow = await repository.findApprovalWorkflow(env, context.companyId, "asset_deduction");
  if (!workflow || workflow.is_enabled !== 1) throw new ConflictError("Approval workflow is not configured for this asset deduction.");
  const approvalRequestId = createPrefixedId("approval_req");
  await repository.createApprovalRequest(env, {
    id: approvalRequestId,
    companyId: context.companyId,
    workflowId: workflow.id,
    entityId: deductionId,
    employeeId,
    requestedBy: context.actorUserId,
    payloadJson: JSON.stringify(payload),
  });
  return approvalRequestId;
};

export const createDeductionRequest = async (
  env: Env,
  context: AuthActor,
  asset: any,
  assignment: any,
  input: AssetDeductionRequestInput | (AssetMarkInput & { deduction_amount: number }),
) => {
  const amount = "amount" in input ? input.amount : input.deduction_amount;
  const employeeId = assignment.employee_id;
  if (!employeeId) throw new AppError("A deduction can only be requested for an employee asset assignment.", "VALIDATION_ERROR", 400);
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  await assertDeductionMonthUnlocked(env, context.companyId, input.deduction_month);
  const id = createPrefixedId("asset_ded");
  const approvalRequestId = await createApprovalIfRequired(env, context, id, employeeId, {
    asset_id: asset.id,
    assignment_id: assignment.id,
    employee_id: employeeId,
    amount,
    deduction_month: input.deduction_month ?? null,
  });
  await repository.createDeduction(env, {
    id,
    companyId: context.companyId,
    assignmentId: assignment.id,
    employeeId,
    amount,
    reason: reasonPayload(input.reason, input.deduction_month),
    approvalRequestId,
  });
  return { deduction_id: id, approval_request_id: approvalRequestId };
};

export const assertDeductionActionAllowed = async (env: Env, context: AuthActor, deduction: any) => {
  if (!permissionService.hasOutletAccess(context, deduction.outlet_id)) throw new OutletAccessError("You do not have access to this asset deduction.");
  const parsed = parseDeductionReason(deduction.reason);
  await assertDeductionMonthUnlocked(env, context.companyId, parsed.deduction_month ?? undefined);
  if (deduction.payroll_item_id) throw new LockedRecordError("This deduction affects a locked payroll period.");
  if (deduction.status !== "pending") throw new ConflictError("This asset deduction has already been reviewed.");
};
