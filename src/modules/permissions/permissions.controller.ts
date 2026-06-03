import type { Context } from "hono";

import * as permissionsService from "./permissions.service";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

export const listPermissions = async (c: Context<AppContext>) =>
  ok(await permissionsService.listPermissions(c.env, actor(c)), "Permissions loaded successfully.", {
    requestId: c.get("requestId"),
  });
