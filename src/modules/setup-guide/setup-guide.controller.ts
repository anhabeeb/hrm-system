import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok } from "../../utils/response";

import * as setupGuideService from "./setup-guide.service";

const readJson = async (c: Context<AppContext>): Promise<Record<string, unknown>> =>
  c.req.json().catch(() => ({}));

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new AuthError("Please sign in to continue.");
  }
  return authUser;
};

const activityKey = (c: Context<AppContext>) => {
  const value = c.req.param("activityKey");
  if (!value) {
    throw new ValidationError("Please choose a valid setup activity.");
  }
  return value;
};

export const getStatus = async (c: Context<AppContext>) =>
  ok(await setupGuideService.getStatus(c.env, actor(c)), "Setup guide status loaded.", {
    requestId: c.get("requestId"),
  });

export const getActivities = async (c: Context<AppContext>) =>
  ok(await setupGuideService.getActivities(c.env, actor(c)), "Setup guide activities loaded.", {
    requestId: c.get("requestId"),
  });

export const startActivity = async (c: Context<AppContext>) =>
  ok(
    await setupGuideService.updateActivity(c.env, actor(c), activityKey(c), "start"),
    "Setup step started.",
    { requestId: c.get("requestId") },
  );

export const completeActivity = async (c: Context<AppContext>) =>
  ok(
    await setupGuideService.updateActivity(c.env, actor(c), activityKey(c), "complete", await readJson(c)),
    "Setup step marked complete.",
    { requestId: c.get("requestId") },
  );

export const skipActivity = async (c: Context<AppContext>) =>
  ok(
    await setupGuideService.updateActivity(c.env, actor(c), activityKey(c), "skip", await readJson(c)),
    "Setup step skipped.",
    { requestId: c.get("requestId") },
  );

export const resumeActivity = async (c: Context<AppContext>) =>
  ok(
    await setupGuideService.updateActivity(c.env, actor(c), activityKey(c), "resume"),
    "Setup step resumed.",
    { requestId: c.get("requestId") },
  );

export const finish = async (c: Context<AppContext>) =>
  ok(await setupGuideService.finish(c.env, actor(c)), "Setup wizard completed.", {
    requestId: c.get("requestId"),
  });

export const skipForNow = async (c: Context<AppContext>) =>
  ok(await setupGuideService.skipForNow(c.env, actor(c), await readJson(c)), "Setup wizard saved for later.", {
    requestId: c.get("requestId"),
  });

export const recalculate = async (c: Context<AppContext>) =>
  ok(await setupGuideService.recalculate(c.env, actor(c)), "Setup progress recalculated.", {
    requestId: c.get("requestId"),
  });

export const moduleChoice = async (c: Context<AppContext>) =>
  ok(await setupGuideService.moduleChoice(c.env, actor(c), await readJson(c)), "Setup module choice recorded.", {
    requestId: c.get("requestId"),
  });
