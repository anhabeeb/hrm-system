import type { Context } from "hono";

import * as service from "./company.service";
import { validateCompanyProfileUpdate } from "./company.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const getProfile = async (c: Context<AppContext>) =>
  ok(
    { profile: await service.getCompanyProfile(c.env, actor(c)) },
    "Company information loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const updateProfile = async (c: Context<AppContext>) =>
  ok(
    await service.updateCompanyProfile(
      c.env,
      actor(c),
      validateCompanyProfileUpdate(await body(c)),
    ),
    "Company information updated successfully.",
    { requestId: c.get("requestId") },
  );
