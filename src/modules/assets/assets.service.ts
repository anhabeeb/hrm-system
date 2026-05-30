import { ASSET_AUDIT_ACTIONS } from "./assets.constants";
import * as assignmentService from "./asset-assignment.service";
import * as deductionService from "./asset-deduction.service";
import * as statusService from "./asset-status.service";
import * as repository from "./assets.repository";
import type {
  AssetAssignInput,
  AssetCreateInput,
  AssetDeductionActionInput,
  AssetDeductionFilters,
  AssetDeductionRequestInput,
  AssetListFilters,
  AssetListResult,
  AssetMarkInput,
  AssetReturnInput,
  AssetUpdateInput,
} from "./assets.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
});
const scope = (context: AuthActor) => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});
const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityType: string; entityId: string; outletId?: string | null; employeeId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "assets",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId ?? undefined,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const broadcast = (env: Env, context: AuthActor, type: string, payload: Record<string, unknown>) =>
  broadcastEvent(env, { roomName: `company:${context.companyId}`, type, payload, triggeredBy: context.actorUserId }).catch(() => undefined);

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this asset record.");
  }
};
const ensureAsset = async (env: Env, context: AuthActor, id: string) => {
  const asset = await repository.findAssetById(env, context.companyId, id);
  if (!asset) throw new NotFoundError("Asset not found.");
  assertOutletAccess(context, asset.access_outlet_id ?? asset.outlet_id);
  return asset;
};
const ensureCodeUnique = async (env: Env, companyId: string, assetCode: string, currentId?: string) => {
  const existing = await repository.findAssetByCode(env, companyId, assetCode);
  if (existing && existing.id !== currentId) {
    throw new AppError("This asset code is already in use.", "ASSET_CODE_EXISTS", 409);
  }
};

export const listAssets = async (env: Env, context: AuthActor, filters: AssetListFilters): Promise<AssetListResult<any>> => {
  const total = await repository.countAssets(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listAssets(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getAsset = async (env: Env, context: AuthActor, id: string) => {
  const asset = await ensureAsset(env, context, id);
  return { asset };
};

export const createAsset = async (env: Env, context: AuthActor, input: AssetCreateInput) => {
  await ensureCodeUnique(env, context.companyId, input.asset_code);
  if (input.outlet_id) {
    const outlet = await repository.findOutlet(env, context.companyId, input.outlet_id);
    if (!outlet || outlet.status !== "active") throw new NotFoundError("Outlet not found.");
    if (!permissionService.hasOutletAccess(context, outlet.id)) throw new OutletAccessError("You do not have access to this outlet.");
  }
  const id = createPrefixedId("asset");
  await repository.createAsset(env, id, context.companyId, input);
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.created, entityType: "asset", entityId: id, outletId: input.outlet_id, newValue: input });
  await broadcast(env, context, "assets.created", { asset_id: id });
  return { asset: await repository.findAssetById(env, context.companyId, id) };
};

export const updateAsset = async (env: Env, context: AuthActor, id: string, input: AssetUpdateInput) => {
  const existing = await ensureAsset(env, context, id);
  statusService.assertAssetPatchAllowsOutletChange(existing, input.outlet_id);
  if (input.asset_code) await ensureCodeUnique(env, context.companyId, input.asset_code, id);
  if (input.outlet_id !== undefined && input.outlet_id !== null) {
    const outlet = await repository.findOutlet(env, context.companyId, input.outlet_id);
    if (!outlet || outlet.status !== "active") throw new NotFoundError("Outlet not found.");
    if (!permissionService.hasOutletAccess(context, outlet.id)) throw new OutletAccessError("You do not have access to this outlet.");
  }
  await repository.updateAsset(env, context.companyId, id, input);
  const updated = await repository.findAssetById(env, context.companyId, id);
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.updated, entityType: "asset", entityId: id, outletId: updated?.access_outlet_id, oldValue: existing, newValue: input });
  await broadcast(env, context, "assets.updated", { asset_id: id });
  return { asset: updated };
};

export const assignAsset = async (env: Env, context: AuthActor, id: string, input: AssetAssignInput) => {
  const asset = await ensureAsset(env, context, id);
  const result = await assignmentService.assignAsset(env, context, asset, input);
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.assigned, entityType: "asset", entityId: id, outletId: result.outlet_id, employeeId: result.employee_id, newValue: input, reason: input.reason });
  await broadcast(env, context, "assets.assigned", { asset_id: id });
  return result;
};

export const returnAsset = async (env: Env, context: AuthActor, id: string, input: AssetReturnInput) => {
  const asset = await ensureAsset(env, context, id);
  const result = await assignmentService.returnAsset(env, context, asset, input);
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.returned, entityType: "asset", entityId: id, outletId: asset.access_outlet_id, oldValue: asset, newValue: input, reason: input.reason });
  await broadcast(env, context, "assets.returned", { asset_id: id });
  return result;
};

const markAsset = async (env: Env, context: AuthActor, id: string, input: AssetMarkInput, status: "lost" | "damaged") => {
  const asset = await ensureAsset(env, context, id);
  const assignment = await repository.findActiveAssignment(env, context.companyId, id);
  if (assignment) {
    const accessOutlet = assignment.employee_outlet_id ?? assignment.outlet_id ?? asset.access_outlet_id;
    assertOutletAccess(context, accessOutlet);
    await repository.updateAssignmentStatusOnly(env, context.companyId, assignment.id, status, status);
  }
  await repository.updateAssetStatus(env, context.companyId, id, status, status, asset.outlet_id);
  let deduction: Record<string, unknown> | null = null;
  if (input.request_deduction) {
    if (!input.deduction_amount) throw new ConflictError("Please enter a deduction amount.");
    if (!assignment) throw new ConflictError("A deduction can only be requested for an assigned asset.");
    deduction = await deductionService.createDeductionRequest(env, context, asset, assignment, { ...input, deduction_amount: input.deduction_amount });
  }
  await audit(env, context, {
    action: status === "lost" ? ASSET_AUDIT_ACTIONS.markedLost : ASSET_AUDIT_ACTIONS.markedDamaged,
    entityType: "asset",
    entityId: id,
    outletId: asset.access_outlet_id,
    employeeId: assignment?.employee_id,
    oldValue: asset,
    newValue: { status, deduction },
    reason: input.reason,
  });
  return { status, deduction };
};

export const markLost = (env: Env, context: AuthActor, id: string, input: AssetMarkInput) => markAsset(env, context, id, input, "lost");
export const markDamaged = (env: Env, context: AuthActor, id: string, input: AssetMarkInput) => markAsset(env, context, id, input, "damaged");

export const requestDeduction = async (env: Env, context: AuthActor, id: string, input: AssetDeductionRequestInput) => {
  const asset = await ensureAsset(env, context, id);
  const assignment = await repository.findActiveAssignment(env, context.companyId, id);
  statusService.assertAssetHasAssignment(assignment);
  const result = await deductionService.createDeductionRequest(env, context, asset, assignment, input);
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.deductionRequested, entityType: "asset_deduction", entityId: result.deduction_id, outletId: asset.access_outlet_id, employeeId: assignment.employee_id, newValue: input, reason: input.reason });
  await broadcast(env, context, "assets.deduction_requested", { asset_id: id, deduction_id: result.deduction_id });
  return result;
};

export const approveDeduction = async (env: Env, context: AuthActor, deductionId: string, input: AssetDeductionActionInput) => {
  const deduction = await repository.findDeductionById(env, context.companyId, deductionId);
  if (!deduction) throw new NotFoundError("Asset deduction not found.");
  await deductionService.assertDeductionActionAllowed(env, context, deduction);
  await repository.updateDeductionStatus(env, context.companyId, deductionId, "approved");
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.deductionApproved, entityType: "asset_deduction", entityId: deductionId, outletId: deduction.outlet_id, employeeId: deduction.employee_id, oldValue: deduction, newValue: { status: "approved" }, reason: input.reason });
  await broadcast(env, context, "assets.deduction_approved", { deduction_id: deductionId });
  return { approved: true };
};

export const rejectDeduction = async (env: Env, context: AuthActor, deductionId: string, input: AssetDeductionActionInput) => {
  const deduction = await repository.findDeductionById(env, context.companyId, deductionId);
  if (!deduction) throw new NotFoundError("Asset deduction not found.");
  await deductionService.assertDeductionActionAllowed(env, context, deduction);
  await repository.updateDeductionStatus(env, context.companyId, deductionId, "rejected");
  await audit(env, context, { action: ASSET_AUDIT_ACTIONS.deductionRejected, entityType: "asset_deduction", entityId: deductionId, outletId: deduction.outlet_id, employeeId: deduction.employee_id, oldValue: deduction, newValue: { status: "rejected" }, reason: input.reason });
  return { rejected: true };
};

export const listDeductions = async (env: Env, context: AuthActor, filters: AssetDeductionFilters): Promise<AssetListResult<any>> => {
  const total = await repository.countDeductions(env, context.companyId, filters, scope(context));
  const rows = await repository.listDeductions(env, context.companyId, filters, scope(context));
  return {
    rows: rows.map((row) => ({ ...row, deduction_month: deductionService.parseDeductionReason(row.reason).deduction_month, reason: deductionService.parseDeductionReason(row.reason).reason })),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const pendingReturn = async (env: Env, context: AuthActor, filters: AssetListFilters): Promise<AssetListResult<any>> => {
  const total = await repository.countPendingReturn(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.pendingReturn(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};
