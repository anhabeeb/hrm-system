import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./dashboard-preferences.service";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

export const getPreference = async (c: Context<AppContext>) =>
  ok(
    await service.getPreference(c.env, actor(c), c.req.param("dashboardType") ?? ""),
    "Dashboard preferences loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const savePreference = async (c: Context<AppContext>) =>
  ok(
    await service.savePreference(c.env, actor(c), c.req.param("dashboardType") ?? "", await c.req.json()),
    "Dashboard preferences saved successfully.",
    { requestId: c.get("requestId") },
  );

export const resetPreference = async (c: Context<AppContext>) =>
  ok(
    await service.resetPreference(c.env, actor(c), c.req.param("dashboardType") ?? ""),
    "Dashboard layout has been reset.",
    { requestId: c.get("requestId") },
  );
