import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./roster-weekly-matrix.service";
import { validateRosterMatrixChangePayload, validateRosterMatrixScopePayload, validateRosterWeeklyMatrixQuery } from "./roster-weekly-matrix.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const readJson = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const queryFromRequest = (c: Context<AppContext>) => validateRosterWeeklyMatrixQuery({
  week_start: c.req.query("week_start"),
  department_id: c.req.query("department_id"),
  outlet_id: c.req.query("outlet_id"),
  store_id: c.req.query("store_id"),
  search: c.req.query("search"),
  shift_id: c.req.query("shift_id"),
  status: c.req.query("status"),
});

export const getWeeklyMatrix = async (c: Context<AppContext>) =>
  ok(await service.getRosterWeeklyMatrix(c.env, actor(c), queryFromRequest(c)), "Roster weekly matrix loaded successfully.", { requestId: c.get("requestId") });

export const listMatrixEmployees = async (c: Context<AppContext>) =>
  ok(await service.getRosterMatrixEmployees(c.env, actor(c), queryFromRequest(c)), "Roster matrix employees loaded successfully.", { requestId: c.get("requestId") });

export const listMatrixShifts = async (c: Context<AppContext>) =>
  ok(await service.getRosterMatrixShifts(c.env, actor(c), queryFromRequest(c)), "Roster matrix shifts loaded successfully.", { requestId: c.get("requestId") });

export const validateMatrixChanges = async (c: Context<AppContext>) =>
  ok(await service.validateRosterMatrixChanges(c.env, actor(c), validateRosterMatrixChangePayload(await readJson(c))), "Roster matrix changes validated successfully.", { requestId: c.get("requestId") });

export const saveMatrixDraft = async (c: Context<AppContext>) =>
  ok(await service.saveRosterMatrixDraft(c.env, actor(c), validateRosterMatrixChangePayload(await readJson(c))), "Roster matrix draft saved successfully.", { requestId: c.get("requestId") });

export const submitMatrixChanges = async (c: Context<AppContext>) =>
  ok(await service.submitRosterMatrixChanges(c.env, actor(c), validateRosterMatrixChangePayload(await readJson(c))), "Roster matrix changes submitted for approval.", { requestId: c.get("requestId") });

export const applyMatrixChanges = async (c: Context<AppContext>) =>
  ok(await service.applyRosterMatrixChanges(c.env, actor(c), validateRosterMatrixChangePayload(await readJson(c))), "Roster matrix apply request reviewed successfully.", { requestId: c.get("requestId") });

export const copyPreviousWeek = async (c: Context<AppContext>) =>
  ok(await service.copyPreviousWeekRoster(c.env, actor(c), validateRosterMatrixScopePayload(await readJson(c))), "Previous week roster copied as proposed changes.", { requestId: c.get("requestId") });

export const bulkAssign = async (c: Context<AppContext>) =>
  ok(await service.bulkAssignRosterMatrix(c.env, actor(c), validateRosterMatrixChangePayload(await readJson(c))), "Bulk roster assignment validated successfully.", { requestId: c.get("requestId") });
