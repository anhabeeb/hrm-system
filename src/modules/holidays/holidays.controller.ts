import type { Context } from "hono";

import * as service from "./holidays.service";
import {
  validateCheckDate,
  validateHolidayFilters,
  validateHolidayInput,
  validateHolidaySettings,
  validateHolidayUpdate,
  validateReason,
} from "./holidays.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const holidayId = (c: Context<AppContext>) => {
  const id = c.req.param("id");
  if (!id) throw new ValidationError("Holiday is required.");
  return id;
};
const filters = (c: Context<AppContext>) => validateHolidayFilters({
  date: c.req.query("date"),
  from_date: c.req.query("from_date"),
  to_date: c.req.query("to_date"),
  year: c.req.query("year"),
  month: c.req.query("month"),
  outlet_id: c.req.query("outlet_id"),
  department_id: c.req.query("department_id"),
  holiday_type: c.req.query("holiday_type"),
  status: c.req.query("status"),
  recurring: c.req.query("recurring"),
  employee_type: c.req.query("employee_type"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listHolidays = async (c: Context<AppContext>) => {
  const result = await service.listHolidays(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Holidays loaded successfully.", { requestId: c.get("requestId") });
};

export const getHoliday = async (c: Context<AppContext>) =>
  ok(await service.getHoliday(c.env, actor(c), holidayId(c)), "Holiday loaded successfully.", { requestId: c.get("requestId") });

export const createHoliday = async (c: Context<AppContext>) =>
  created(await service.createHoliday(c.env, actor(c), validateHolidayInput(await body(c))), "Holiday created successfully.", { requestId: c.get("requestId") });

export const updateHoliday = async (c: Context<AppContext>) =>
  ok(await service.updateHoliday(c.env, actor(c), holidayId(c), validateHolidayUpdate(await body(c))), "Holiday updated successfully.", { requestId: c.get("requestId") });

export const archiveHoliday = async (c: Context<AppContext>) => {
  const input = validateReason(await body(c));
  return ok(await service.archiveHoliday(c.env, actor(c), holidayId(c), input.reason), "Holiday archived successfully.", { requestId: c.get("requestId") });
};

export const restoreHoliday = async (c: Context<AppContext>) => {
  const input = validateReason(await body(c));
  return ok(await service.restoreHoliday(c.env, actor(c), holidayId(c), input.reason), "Holiday restored successfully.", { requestId: c.get("requestId") });
};

export const calendar = async (c: Context<AppContext>) =>
  ok(await service.calendar(c.env, actor(c), filters(c)), "Holiday calendar loaded successfully.", { requestId: c.get("requestId") });

export const range = async (c: Context<AppContext>) =>
  ok(await service.range(c.env, actor(c), filters(c)), "Holiday range loaded successfully.", { requestId: c.get("requestId") });

export const checkDate = async (c: Context<AppContext>) =>
  ok(await service.checkDate(c.env, actor(c), validateCheckDate(await body(c))), "Holiday date check completed successfully.", { requestId: c.get("requestId") });

export const bulkUpsert = async (c: Context<AppContext>) => {
  const payload = await body(c);
  const rows = Array.isArray(payload) ? payload.map(validateHolidayInput) : (payload.rows ?? []).map(validateHolidayInput);
  return ok(await service.bulkUpsert(c.env, actor(c), rows), "Holiday bulk upsert completed.", { requestId: c.get("requestId") });
};

export const getSettings = async (c: Context<AppContext>) =>
  ok(await service.getSettings(c.env, actor(c)), "Holiday settings loaded successfully.", { requestId: c.get("requestId") });

export const updateSettings = async (c: Context<AppContext>) =>
  ok(await service.updateSettings(c.env, actor(c), validateHolidaySettings(await body(c))), "Holiday settings updated successfully.", { requestId: c.get("requestId") });
