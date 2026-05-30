import type { Context } from "hono";

import * as outletsService from "./outlets.service";
import {
  validateOutletCreateInput,
  validateOutletFilters,
  validateOutletUpdateInput,
} from "./outlets.validators";
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
  if (!value) throw new ValidationError("Outlet is required.");
  return value;
};
const reason = async (c: Context<AppContext>) => {
  const payload = (await body(c)) as { reason?: unknown };
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 3) {
    throw new ValidationError("A reason is required for this action.");
  }
  return payload.reason.trim();
};

export const listOutlets = async (c: Context<AppContext>) => {
  const result = await outletsService.listOutlets(
    c.env,
    actor(c),
    validateOutletFilters({
      search: c.req.query("search"),
      status: c.req.query("status"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_by: c.req.query("sort_by"),
      sort_direction: c.req.query("sort_direction"),
    }),
  );
  return paginated(result.rows, result.pagination, "Outlets loaded successfully.", {
    requestId: c.get("requestId"),
  });
};
export const getOutlet = async (c: Context<AppContext>) =>
  ok({ outlet: await outletsService.getOutlet(c.env, actor(c), id(c)) }, "Outlet loaded successfully.", {
    requestId: c.get("requestId"),
  });
export const createOutlet = async (c: Context<AppContext>) =>
  created(
    await outletsService.createOutlet(c.env, actor(c), validateOutletCreateInput(await body(c))),
    "Outlet created successfully.",
    { requestId: c.get("requestId") },
  );
export const updateOutlet = async (c: Context<AppContext>) =>
  ok(
    await outletsService.updateOutlet(c.env, actor(c), id(c), validateOutletUpdateInput(await body(c))),
    "Outlet updated successfully.",
    { requestId: c.get("requestId") },
  );
export const enableOutlet = async (c: Context<AppContext>) =>
  ok(await outletsService.setOutletStatus(c.env, actor(c), id(c), "active", await reason(c)), "Outlet enabled successfully.", {
    requestId: c.get("requestId"),
  });
export const disableOutlet = async (c: Context<AppContext>) =>
  ok(await outletsService.setOutletStatus(c.env, actor(c), id(c), "disabled", await reason(c)), "Outlet disabled successfully.", {
    requestId: c.get("requestId"),
  });
