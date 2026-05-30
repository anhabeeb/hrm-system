import type { Context } from "hono";

import * as service from "./long-leave.service";
import {
  validateLongLeaveAction,
  validateLongLeaveCreate,
  validateLongLeaveFilters,
  validateLongLeaveOverride,
  validateLongLeaveReturn,
} from "./long-leave.validators";
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
  if (!value) throw new ValidationError("Long leave record is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  status: c.req.query("status"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listLongLeave = async (c: Context<AppContext>) => {
  const result = await service.listLongLeave(c.env, actor(c), validateLongLeaveFilters(query(c)));
  return paginated(result.rows, result.pagination, "Long leave records loaded successfully.", { requestId: c.get("requestId") });
};

export const getLongLeave = async (c: Context<AppContext>) =>
  ok(await service.getLongLeave(c.env, actor(c), id(c)), "Long leave record loaded successfully.", { requestId: c.get("requestId") });

export const createLongLeave = async (c: Context<AppContext>) =>
  {
    const result = await service.createLongLeave(c.env, actor(c), validateLongLeaveCreate(await body(c)));
    return created(
      result,
      result.salary_impact_calculated
        ? "Long leave request created successfully. Salary impact preview was calculated."
        : "Long leave request created successfully. Salary impact review is required.",
      { requestId: c.get("requestId") },
    );
  };

export const getSalaryImpact = async (c: Context<AppContext>) =>
  ok({ months: await service.getSalaryImpact(c.env, actor(c), id(c)) }, "Long leave salary impact loaded successfully.", { requestId: c.get("requestId") });

export const calculateSalaryImpact = async (c: Context<AppContext>) =>
  ok(await service.calculateSalaryImpact(c.env, actor(c), id(c)), "Long leave salary impact calculated successfully.", { requestId: c.get("requestId") });

export const confirmSalaryImpact = async (c: Context<AppContext>) =>
  ok(await service.confirmSalaryImpact(c.env, actor(c), id(c), validateLongLeaveAction(await body(c))), "Long leave salary impact confirmed.", { requestId: c.get("requestId") });

export const approveLongLeave = async (c: Context<AppContext>) =>
  ok(await service.approveLongLeave(c.env, actor(c), id(c), validateLongLeaveAction(await body(c))), "Long leave approved.", { requestId: c.get("requestId") });

export const rejectLongLeave = async (c: Context<AppContext>) =>
  ok(await service.rejectLongLeave(c.env, actor(c), id(c), validateLongLeaveAction(await body(c))), "Long leave rejected.", { requestId: c.get("requestId") });

export const returnFromLongLeave = async (c: Context<AppContext>) =>
  ok(await service.returnFromLongLeave(c.env, actor(c), id(c), validateLongLeaveReturn(await body(c))), "Long leave return confirmed.", { requestId: c.get("requestId") });

export const overrideImpact = async (c: Context<AppContext>) =>
  ok(await service.overrideImpact(c.env, actor(c), id(c), validateLongLeaveOverride(await body(c))), "Long leave salary impact override saved.", { requestId: c.get("requestId") });

export const settingsPreview = async (c: Context<AppContext>) =>
  ok(await service.settingsPreview(c.env, actor(c)), "Long leave settings preview loaded successfully.", { requestId: c.get("requestId") });
