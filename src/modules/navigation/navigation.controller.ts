import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./navigation.service";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

export const badges = async (c: Context<AppContext>) =>
  ok(await service.getNavigationBadges(c.env, actor(c)), "Navigation badges loaded successfully.", {
    requestId: c.get("requestId"),
  });
