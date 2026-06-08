import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./rosters.service";
import {
  validateRosterActionInput,
  validateRosterBulkInput,
  validateRosterConflictFilters,
  validateRosterListFilters,
  validateRosterPublishInput,
  validateRosterShiftInput,
  validateRosterShiftUpdateInput,
  validateShiftTemplateFilters,
  validateShiftTemplateInput,
  validateShiftTemplateUpdateInput,
} from "./rosters.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const readJson = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const idParam = (c: Context<AppContext>, key = "id") => {
  const id = c.req.param(key);
  if (!id) throw new ValidationError("Record is required.");
  return id;
};

export const listShiftTemplates = async (c: Context<AppContext>) => {
  const result = await service.listShiftTemplates(c.env, actor(c), validateShiftTemplateFilters({
    outlet_id: c.req.query("outlet_id"),
    department_id: c.req.query("department_id"),
    status: c.req.query("status"),
    search: c.req.query("search"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  }));
  return paginated(result.rows, result.pagination, "Shift templates loaded successfully.", { requestId: c.get("requestId") });
};

export const createShiftTemplate = async (c: Context<AppContext>) =>
  created(await service.createShiftTemplate(c.env, actor(c), validateShiftTemplateInput(await readJson(c))), "Shift template created successfully.", { requestId: c.get("requestId") });

export const getShiftTemplate = async (c: Context<AppContext>) =>
  ok(await service.getShiftTemplate(c.env, actor(c), idParam(c)), "Shift template loaded successfully.", { requestId: c.get("requestId") });

export const updateShiftTemplate = async (c: Context<AppContext>) =>
  ok(await service.updateShiftTemplate(c.env, actor(c), idParam(c), validateShiftTemplateUpdateInput(await readJson(c))), "Shift template updated successfully.", { requestId: c.get("requestId") });

export const disableShiftTemplate = async (c: Context<AppContext>) =>
  ok(await service.setShiftTemplateEnabled(c.env, actor(c), idParam(c), false, validateRosterActionInput(await readJson(c))), "Shift template disabled successfully.", { requestId: c.get("requestId") });

export const enableShiftTemplate = async (c: Context<AppContext>) =>
  ok(await service.setShiftTemplateEnabled(c.env, actor(c), idParam(c), true, validateRosterActionInput(await readJson(c))), "Shift template enabled successfully.", { requestId: c.get("requestId") });

export const listRosters = async (c: Context<AppContext>) => {
  const result = await service.listRosterShifts(c.env, actor(c), validateRosterListFilters({
    outlet_id: c.req.query("outlet_id"),
    department_id: c.req.query("department_id"),
    position_id: c.req.query("position_id"),
    employee_id: c.req.query("employee_id"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    status: c.req.query("status"),
    conflict_status: c.req.query("conflict_status"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  }));
  return paginated(result.rows, result.pagination, "Roster shifts loaded successfully.", { requestId: c.get("requestId") });
};

export const createRoster = async (c: Context<AppContext>) =>
  created(await service.createRosterShift(c.env, actor(c), validateRosterShiftInput(await readJson(c))), "Roster shift created successfully.", { requestId: c.get("requestId") });

export const getRoster = async (c: Context<AppContext>) =>
  ok(await service.getRosterShift(c.env, actor(c), idParam(c)), "Roster shift loaded successfully.", { requestId: c.get("requestId") });

export const updateRoster = async (c: Context<AppContext>) =>
  ok(await service.updateRosterShift(c.env, actor(c), idParam(c), validateRosterShiftUpdateInput(await readJson(c))), "Roster shift updated successfully.", { requestId: c.get("requestId") });

export const cancelRoster = async (c: Context<AppContext>) =>
  ok(await service.cancelRosterShift(c.env, actor(c), idParam(c), validateRosterActionInput(await readJson(c))), "Roster shift cancelled successfully.", { requestId: c.get("requestId") });

export const bulkCreateRoster = async (c: Context<AppContext>) =>
  created(await service.bulkCreateRoster(c.env, actor(c), validateRosterBulkInput(await readJson(c))), "Roster shifts created successfully.", { requestId: c.get("requestId") });

export const publishRoster = async (c: Context<AppContext>) =>
  ok(await service.publishRoster(c.env, actor(c), validateRosterPublishInput(await readJson(c))), "Roster published successfully.", { requestId: c.get("requestId") });

export const listConflicts = async (c: Context<AppContext>) => {
  const result = await service.listConflicts(c.env, actor(c), validateRosterConflictFilters({
    outlet_id: c.req.query("outlet_id"),
    department_id: c.req.query("department_id"),
    employee_id: c.req.query("employee_id"),
    severity: c.req.query("severity"),
    status: c.req.query("status"),
    conflict_type: c.req.query("conflict_type"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  }));
  return paginated(result.rows, result.pagination, "Roster conflicts loaded successfully.", { requestId: c.get("requestId") });
};

export const resolveConflict = async (c: Context<AppContext>) =>
  ok(
    await service.resolveConflict(c.env, actor(c), idParam(c), validateRosterActionInput(await readJson(c))),
    "Roster conflict resolved successfully.",
    { requestId: c.get("requestId") },
  );

export const overrideConflict = async (c: Context<AppContext>) =>
  ok(
    await service.overrideConflict(c.env, actor(c), idParam(c), validateRosterActionInput(await readJson(c))),
    "Roster conflict overridden successfully.",
    { requestId: c.get("requestId") },
  );
