import type { Context } from "hono";

import * as service from "./advances.service";
import { validateAdvanceAction, validateAdvanceCreate, validateAdvanceFilters, validateAdvanceUpdate } from "./advances.validators";
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
  if (!value) throw new ValidationError("Advance payment is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  status: c.req.query("status"),
  deduction_month: c.req.query("deduction_month"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listAdvances = async (c: Context<AppContext>) => {
  const result = await service.listAdvances(c.env, actor(c), validateAdvanceFilters(query(c)));
  return paginated(result.rows, result.pagination, "Advance payments loaded successfully.", { requestId: c.get("requestId") });
};
export const getAdvance = async (c: Context<AppContext>) => ok({ advance: await service.getAdvance(c.env, actor(c), id(c)) }, "Advance payment loaded successfully.", { requestId: c.get("requestId") });
export const createAdvance = async (c: Context<AppContext>) => created(await service.createAdvance(c.env, actor(c), validateAdvanceCreate(await body(c))), "Advance payment created successfully.", { requestId: c.get("requestId") });
export const updateAdvance = async (c: Context<AppContext>) => ok(await service.updateAdvance(c.env, actor(c), id(c), validateAdvanceUpdate(await body(c))), "Advance payment updated successfully.", { requestId: c.get("requestId") });
export const approveAdvance = async (c: Context<AppContext>) => ok(await service.approveAdvance(c.env, actor(c), id(c), validateAdvanceAction(await body(c))), "Advance payment approved.", { requestId: c.get("requestId") });
export const rejectAdvance = async (c: Context<AppContext>) => ok(await service.rejectAdvance(c.env, actor(c), id(c), validateAdvanceAction(await body(c))), "Advance payment rejected.", { requestId: c.get("requestId") });
