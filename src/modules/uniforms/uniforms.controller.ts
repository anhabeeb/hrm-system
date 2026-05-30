import type { Context } from "hono";

import * as service from "./uniforms.service";
import { validateUniformFilters, validateUniformIssue, validateUniformReturn } from "./uniforms.validators";
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
  if (!value) throw new ValidationError("Uniform issue is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  uniform_type: c.req.query("uniform_type"),
  status: c.req.query("status"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listUniforms = async (c: Context<AppContext>) => {
  const result = await service.listUniforms(c.env, actor(c), validateUniformFilters(query(c)));
  return paginated(result.rows, result.pagination, "Uniform records loaded successfully.", { requestId: c.get("requestId") });
};
export const issueUniform = async (c: Context<AppContext>) =>
  created(await service.issueUniform(c.env, actor(c), validateUniformIssue(await body(c))), "Uniform issued successfully.", { requestId: c.get("requestId") });
export const getUniform = async (c: Context<AppContext>) =>
  ok(await service.getUniform(c.env, actor(c), id(c)), "Uniform record loaded successfully.", { requestId: c.get("requestId") });
export const returnUniform = async (c: Context<AppContext>) =>
  ok(await service.returnUniform(c.env, actor(c), id(c), validateUniformReturn(await body(c))), "Uniform returned successfully.", { requestId: c.get("requestId") });
export const pendingReturn = async (c: Context<AppContext>) => {
  const result = await service.pendingReturn(c.env, actor(c), validateUniformFilters(query(c)));
  return paginated(result.rows, result.pagination, "Pending uniform returns loaded successfully.", { requestId: c.get("requestId") });
};
