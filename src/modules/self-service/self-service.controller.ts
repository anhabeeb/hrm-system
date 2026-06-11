import type { Context } from "hono";

import type { AppContext } from "../../types/api.types";
import { ok } from "../../utils/response";
import * as service from "./self-service.service";

const auth = (c: Context<AppContext>) => c.get("authUser")!;

export const dashboard = async (c: Context<AppContext>) =>
  ok(await service.getSelfDashboard(c.env, auth(c)));

export const profile = async (c: Context<AppContext>) =>
  ok(await service.getSelfProfile(c.env, auth(c)));

export const accessSummary = async (c: Context<AppContext>) =>
  ok(await service.getSelfAccessSummary(c.env, auth(c)));

export const requests = async (c: Context<AppContext>) =>
  ok(await service.getSelfRequests(c.env, auth(c)));

export const pendingApprovals = async (c: Context<AppContext>) =>
  ok(await service.getSelfPendingApprovals(c.env, auth(c)));

export const navigation = async (c: Context<AppContext>) =>
  ok(await service.getSelfNavigation(c.env, auth(c)));
