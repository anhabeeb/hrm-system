import type { Context } from "hono";

import type { AppContext } from "../../types/api.types";
import { ok } from "../../utils/response";
import * as service from "./department-weekly-team.service";

const auth = (c: Context<AppContext>) => c.get("authUser")!;

export const weeklyTeamView = async (c: Context<AppContext>) =>
  ok(await service.getDepartmentWeeklyTeamView(c.env, auth(c), {
    department_id: c.req.query("department_id") || undefined,
    week_start: c.req.query("week_start") || undefined,
    outlet_id: c.req.query("outlet_id") || undefined,
    store_id: c.req.query("store_id") || undefined,
    search: c.req.query("search") || undefined,
    status: c.req.query("status") as any,
  }));

export const weeklyTeamDepartments = async (c: Context<AppContext>) =>
  ok(await service.listWeeklyTeamDepartments(c.env, auth(c)));

export const selfWeeklyTeamView = async (c: Context<AppContext>) =>
  ok(await service.getDepartmentWeeklyTeamView(c.env, auth(c), {
    department_id: c.req.query("department_id") || undefined,
    week_start: c.req.query("week_start") || undefined,
    outlet_id: c.req.query("outlet_id") || undefined,
    store_id: c.req.query("store_id") || undefined,
    search: c.req.query("search") || undefined,
    status: c.req.query("status") as any,
    self_service: true,
  }));

export const selfWeeklyTeamDepartments = async (c: Context<AppContext>) =>
  ok(await service.listWeeklyTeamDepartments(c.env, auth(c), { self_service: true }));
