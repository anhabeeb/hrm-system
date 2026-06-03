import * as repository from "./assets.repository";
import type { AssetAssignInput, AssetReturnInput } from "./assets.types";
import * as statusService from "./asset-status.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { ConflictError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

export const resolveEmployeeForAssignment = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) throw new NotFoundError("The requested employee could not be found.");
  if (["archived", "resigned", "terminated"].includes(employee.employment_status)) {
    throw new ConflictError("This employee is not active.");
  }
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

export const resolveOutletForAssignment = async (env: Env, context: AuthActor, outletId: string) => {
  const outlet = await repository.findOutlet(env, context.companyId, outletId);
  if (!outlet || outlet.status !== "active") throw new NotFoundError("Outlet not found.");
  if (!permissionService.hasOutletAccess(context, outlet.id)) throw new OutletAccessError("You do not have access to this outlet.");
  return outlet;
};

export const assignAsset = async (env: Env, context: AuthActor, asset: any, input: AssetAssignInput) => {
  const activeAssignment = await repository.findActiveAssignment(env, context.companyId, asset.id);
  statusService.assertAssetCanAssign(asset, activeAssignment);
  const employee = input.employee_id ? await resolveEmployeeForAssignment(env, context, input.employee_id) : null;
  const outlet = input.outlet_id ? await resolveOutletForAssignment(env, context, input.outlet_id) : null;
  const assignmentId = createPrefixedId("asset_asg");
  const assignmentOutletId = employee?.primary_outlet_id ?? outlet?.id ?? null;
  await repository.createAssignment(env, {
    id: assignmentId,
    companyId: context.companyId,
    assetId: asset.id,
    employeeId: employee?.id ?? null,
    outletId: outlet?.id ?? null,
    issuedDate: input.issued_date,
    issueCondition: input.issue_condition,
    createdBy: context.actorUserId,
  });
  await repository.updateAssetStatus(env, context.companyId, asset.id, "issued", input.issue_condition ?? asset.current_condition, assignmentOutletId);
  return { assignment_id: assignmentId, outlet_id: assignmentOutletId, employee_id: employee?.id ?? null };
};

export const returnAsset = async (env: Env, context: AuthActor, asset: any, input: AssetReturnInput) => {
  const assignment = await repository.findActiveAssignment(env, context.companyId, asset.id);
  statusService.assertAssetHasAssignment(assignment);
  const accessOutletId = assignment.employee_outlet_id ?? assignment.outlet_id ?? asset.outlet_id;
  if (!permissionService.hasOutletAccess(context, accessOutletId)) throw new OutletAccessError("You do not have access to this asset assignment.");
  if (input.returned_date < assignment.issued_date) throw new ConflictError("Return date cannot be before the issue date.");
  await repository.returnAssignment(env, context.companyId, assignment.id, input.returned_date, input.return_condition, "returned");
  await repository.updateAssetStatus(env, context.companyId, asset.id, "available", input.return_condition ?? asset.current_condition, asset.outlet_id);
  return { assignment_id: assignment.id };
};
