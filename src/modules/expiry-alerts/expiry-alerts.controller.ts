import type { Context } from "hono";

import * as service from "./expiry-alerts.service";
import {
  validateExpiryAction,
  validateExpiryAlertFilters,
  validateExpiryScan,
  validateExpirySettings,
} from "./expiry-alerts.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Expiry alert is required.");
  return value;
};

const filters = (c: Context<AppContext>) => validateExpiryAlertFilters({
  status: c.req.query("status"),
  severity: c.req.query("severity"),
  source_type: c.req.query("source_type"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  department_id: c.req.query("department_id"),
  alert_type: c.req.query("alert_type"),
  from_date: c.req.query("from_date"),
  to_date: c.req.query("to_date"),
  include_closed: c.req.query("include_closed"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listAlerts = async (c: Context<AppContext>) => {
  const result = await service.listAlerts(c.env, actor(c), filters(c));
  return paginated(result.rows as any[], result.pagination, "Expiry alerts loaded successfully.", { requestId: c.get("requestId") });
};

export const getAlert = async (c: Context<AppContext>) =>
  ok(await service.getAlert(c.env, actor(c), id(c)), "Expiry alert loaded successfully.", { requestId: c.get("requestId") });

export const summary = async (c: Context<AppContext>) =>
  ok(await service.getSummary(c.env, actor(c)), "Expiry alert summary loaded successfully.", { requestId: c.get("requestId") });

export const settings = async (c: Context<AppContext>) =>
  ok(await service.getSettings(c.env, actor(c)), "Expiry alert settings loaded successfully.", { requestId: c.get("requestId") });

export const updateSettings = async (c: Context<AppContext>) =>
  ok(await service.updateSettings(c.env, actor(c), validateExpirySettings(await body(c))), "Expiry alert settings saved.", { requestId: c.get("requestId") });

export const previewScan = async (c: Context<AppContext>) =>
  ok(await service.previewScan(c.env, actor(c), validateExpiryScan(await body(c))), "Expiry scan preview generated.", { requestId: c.get("requestId") });

export const runScan = async (c: Context<AppContext>) =>
  ok(await service.runScan(c.env, actor(c), validateExpiryScan(await body(c))), "Expiry alert scan completed.", { requestId: c.get("requestId") });

export const acknowledge = async (c: Context<AppContext>) =>
  ok(await service.acknowledgeAlert(c.env, actor(c), id(c), validateExpiryAction(await body(c))), "Expiry alert acknowledged.", { requestId: c.get("requestId") });

export const resolve = async (c: Context<AppContext>) =>
  ok(await service.resolveAlert(c.env, actor(c), id(c), validateExpiryAction(await body(c))), "Expiry alert resolved.", { requestId: c.get("requestId") });

export const dismiss = async (c: Context<AppContext>) =>
  ok(await service.dismissAlert(c.env, actor(c), id(c), validateExpiryAction(await body(c))), "Expiry alert dismissed.", { requestId: c.get("requestId") });

export const snooze = async (c: Context<AppContext>) =>
  ok(await service.snoozeAlert(c.env, actor(c), id(c), validateExpiryAction(await body(c))), "Expiry alert snoozed.", { requestId: c.get("requestId") });
