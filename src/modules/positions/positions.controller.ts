import type { Context } from "hono";

import * as service from "./positions.service";
import { validatePositionCreateInput, validatePositionFilters, validatePositionUpdateInput } from "./positions.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Position is required.");
  return value;
};
const reason = async (c: Context<AppContext>) => {
  const payload = (await body(c)) as { reason?: unknown };
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 3) throw new ValidationError("A reason is required for this action.");
  return payload.reason.trim();
};
export const listPositions = async (c: Context<AppContext>) => {
  const result = await service.listPositions(c.env, actor(c), validatePositionFilters({
    search: c.req.query("search"),
    department_id: c.req.query("department_id"),
    level: c.req.query("level"),
    status: c.req.query("status"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_by: c.req.query("sort_by"),
    sort_direction: c.req.query("sort_direction"),
  }));
  return paginated(result.rows, result.pagination, "Positions loaded successfully.", { requestId: c.get("requestId") });
};
export const getPosition = async (c: Context<AppContext>) => ok({ position: await service.getPosition(c.env, actor(c), id(c)) }, "Position loaded successfully.", { requestId: c.get("requestId") });
export const createPosition = async (c: Context<AppContext>) => created(await service.createPosition(c.env, actor(c), validatePositionCreateInput(await body(c))), "Position created successfully.", { requestId: c.get("requestId") });
export const updatePosition = async (c: Context<AppContext>) => ok(await service.updatePosition(c.env, actor(c), id(c), validatePositionUpdateInput(await body(c))), "Position updated successfully.", { requestId: c.get("requestId") });
export const disablePosition = async (c: Context<AppContext>) => ok(await service.setPositionStatus(c.env, actor(c), id(c), "disabled", await reason(c)), "Position disabled successfully.", { requestId: c.get("requestId") });
export const enablePosition = async (c: Context<AppContext>) => ok(await service.setPositionStatus(c.env, actor(c), id(c), "active", await reason(c)), "Position enabled successfully.", { requestId: c.get("requestId") });
export const archivePosition = async (c: Context<AppContext>) => ok(await service.deletePosition(c.env, actor(c), id(c), await reason(c)), "Position archived successfully.", { requestId: c.get("requestId") });
export const deletePosition = async (c: Context<AppContext>) => ok(await service.deletePosition(c.env, actor(c), id(c), await reason(c)), "Position deleted successfully.", { requestId: c.get("requestId") });
