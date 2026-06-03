import type { Context } from "hono";

import * as rolesService from "./roles.service";
import { validateRoleListFilters } from "./roles.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Role is required.");
  return value;
};

export const listRoles = async (c: Context<AppContext>) => {
  const result = await rolesService.listRoles(
    c.env,
    actor(c),
    validateRoleListFilters({
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      search: c.req.query("search"),
      status: c.req.query("status"),
    }),
  );
  return paginated(result.rows, result.pagination, "Roles loaded successfully.", { requestId: c.get("requestId") });
};

export const getRole = async (c: Context<AppContext>) =>
  ok({ role: await rolesService.getRole(c.env, actor(c), id(c)) }, "Role loaded successfully.", { requestId: c.get("requestId") });
