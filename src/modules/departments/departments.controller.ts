import type { Context } from "hono";

import * as service from "./departments.service";
import { validateDepartmentCreateInput, validateDepartmentFilters, validateDepartmentUpdateInput } from "./departments.validators";
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
  if (!value) throw new ValidationError("Department is required.");
  return value;
};
const reason = async (c: Context<AppContext>) => {
  const payload = (await body(c)) as { reason?: unknown };
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 3) throw new ValidationError("A reason is required for this action.");
  return payload.reason.trim();
};
export const listDepartments = async (c: Context<AppContext>) => {
  const result = await service.listDepartments(c.env, actor(c), validateDepartmentFilters({
    search: c.req.query("search"),
    status: c.req.query("status"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_by: c.req.query("sort_by"),
    sort_direction: c.req.query("sort_direction"),
  }));
  return paginated(result.rows, result.pagination, "Departments loaded successfully.", { requestId: c.get("requestId") });
};
export const getDepartment = async (c: Context<AppContext>) => ok({ department: await service.getDepartment(c.env, actor(c), id(c)) }, "Department loaded successfully.", { requestId: c.get("requestId") });
export const createDepartment = async (c: Context<AppContext>) => created(await service.createDepartment(c.env, actor(c), validateDepartmentCreateInput(await body(c))), "Department created successfully.", { requestId: c.get("requestId") });
export const updateDepartment = async (c: Context<AppContext>) => ok(await service.updateDepartment(c.env, actor(c), id(c), validateDepartmentUpdateInput(await body(c))), "Department updated successfully.", { requestId: c.get("requestId") });
export const disableDepartment = async (c: Context<AppContext>) => ok(await service.setDepartmentStatus(c.env, actor(c), id(c), "disabled", await reason(c)), "Department disabled successfully.", { requestId: c.get("requestId") });
export const enableDepartment = async (c: Context<AppContext>) => ok(await service.setDepartmentStatus(c.env, actor(c), id(c), "active", await reason(c)), "Department enabled successfully.", { requestId: c.get("requestId") });
export const archiveDepartment = async (c: Context<AppContext>) => ok(await service.deleteDepartment(c.env, actor(c), id(c), await reason(c)), "Department archived successfully.", { requestId: c.get("requestId") });
export const deleteDepartment = async (c: Context<AppContext>) => ok(await service.deleteDepartment(c.env, actor(c), id(c), await reason(c)), "Department deleted successfully.", { requestId: c.get("requestId") });
