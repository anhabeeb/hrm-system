import type { Context } from "hono";

import * as service from "./assets.service";
import {
  validateAssetAssign,
  validateAssetCreate,
  validateAssetFilters,
  validateAssetMark,
  validateAssetReturn,
  validateAssetUpdate,
  validateDeductionAction,
  validateDeductionFilters,
  validateDeductionRequest,
} from "./assets.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>, name = "id") => {
  const value = c.req.param(name);
  if (!value) throw new ValidationError("Asset is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  search: c.req.query("search"),
  outlet_id: c.req.query("outlet_id"),
  employee_id: c.req.query("employee_id"),
  asset_type: c.req.query("asset_type"),
  status: c.req.query("status"),
  current_condition: c.req.query("current_condition"),
  assigned_to: c.req.query("assigned_to"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
  sort_by: c.req.query("sort_by"),
  sort_direction: c.req.query("sort_direction"),
});

export const listAssets = async (c: Context<AppContext>) => {
  const result = await service.listAssets(c.env, actor(c), validateAssetFilters(query(c)));
  return paginated(result.rows, result.pagination, "Assets loaded successfully.", { requestId: c.get("requestId") });
};
export const getAsset = async (c: Context<AppContext>) =>
  ok(await service.getAsset(c.env, actor(c), id(c)), "Asset loaded successfully.", { requestId: c.get("requestId") });
export const createAsset = async (c: Context<AppContext>) =>
  created(await service.createAsset(c.env, actor(c), validateAssetCreate(await body(c))), "Asset created successfully.", { requestId: c.get("requestId") });
export const updateAsset = async (c: Context<AppContext>) =>
  ok(await service.updateAsset(c.env, actor(c), id(c), validateAssetUpdate(await body(c))), "Asset updated successfully.", { requestId: c.get("requestId") });
export const assignAsset = async (c: Context<AppContext>) =>
  ok(await service.assignAsset(c.env, actor(c), id(c), validateAssetAssign(await body(c))), "Asset assigned successfully.", { requestId: c.get("requestId") });
export const returnAsset = async (c: Context<AppContext>) =>
  ok(await service.returnAsset(c.env, actor(c), id(c), validateAssetReturn(await body(c))), "Asset returned successfully.", { requestId: c.get("requestId") });
export const markLost = async (c: Context<AppContext>) =>
  ok(await service.markLost(c.env, actor(c), id(c), validateAssetMark(await body(c))), "Asset marked as lost.", { requestId: c.get("requestId") });
export const markDamaged = async (c: Context<AppContext>) =>
  ok(await service.markDamaged(c.env, actor(c), id(c), validateAssetMark(await body(c))), "Asset marked as damaged.", { requestId: c.get("requestId") });
export const requestDeduction = async (c: Context<AppContext>) =>
  ok(await service.requestDeduction(c.env, actor(c), id(c), validateDeductionRequest(await body(c))), "Asset deduction request submitted successfully.", { requestId: c.get("requestId") });
export const approveDeduction = async (c: Context<AppContext>) =>
  ok(await service.approveDeduction(c.env, actor(c), id(c), validateDeductionAction(await body(c))), "Asset deduction approved.", { requestId: c.get("requestId") });
export const rejectDeduction = async (c: Context<AppContext>) =>
  ok(await service.rejectDeduction(c.env, actor(c), id(c), validateDeductionAction(await body(c))), "Asset deduction rejected.", { requestId: c.get("requestId") });
export const listDeductions = async (c: Context<AppContext>) => {
  const result = await service.listDeductions(c.env, actor(c), validateDeductionFilters(query(c)));
  return paginated(result.rows, result.pagination, "Asset deductions loaded successfully.", { requestId: c.get("requestId") });
};
export const pendingReturn = async (c: Context<AppContext>) => {
  const result = await service.pendingReturn(c.env, actor(c), validateAssetFilters(query(c)));
  return paginated(result.rows, result.pagination, "Pending asset returns loaded successfully.", { requestId: c.get("requestId") });
};
