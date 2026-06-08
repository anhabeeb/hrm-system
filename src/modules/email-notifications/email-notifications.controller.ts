import type { Context } from "hono";

import * as service from "./email-notifications.service";
import {
  validateEmailFilters,
  validateEmailPreferences,
  validateEmailSettings,
  validatePreviewVariables,
  validateProcessPending,
} from "./email-notifications.validators";
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
  if (!value) throw new ValidationError("Email notification is required.");
  return value;
};

const templateKey = (c: Context<AppContext>) => {
  const value = c.req.param("templateKey");
  if (!value) throw new ValidationError("Email template is required.");
  return value;
};

const filters = (c: Context<AppContext>) => validateEmailFilters({
  status: c.req.query("status"),
  category: c.req.query("category"),
  priority: c.req.query("priority"),
  notification_type: c.req.query("notification_type"),
  recipient_user_id: c.req.query("recipient_user_id"),
  entity_type: c.req.query("entity_type"),
  entity_id: c.req.query("entity_id"),
  from_date: c.req.query("from_date"),
  to_date: c.req.query("to_date"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listEmailJobs = async (c: Context<AppContext>) => {
  const result = await service.listEmailJobs(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Email notifications loaded successfully.", { requestId: c.get("requestId") });
};

export const getEmailJob = async (c: Context<AppContext>) =>
  ok(await service.getEmailJob(c.env, actor(c), id(c)), "Email notification loaded successfully.", { requestId: c.get("requestId") });

export const retryEmailJob = async (c: Context<AppContext>) =>
  ok(await service.sendPendingEmail(c.env, actor(c), id(c)), "Email notification retry processed.", { requestId: c.get("requestId") });

export const processPending = async (c: Context<AppContext>) => {
  const input = validateProcessPending(await body(c));
  return ok(await service.processPendingEmails(c.env, actor(c), input.limit), "Pending email notifications processed.", { requestId: c.get("requestId") });
};

export const preferences = async (c: Context<AppContext>) =>
  ok(await service.getPreferences(c.env, actor(c)), "Email notification preferences loaded successfully.", { requestId: c.get("requestId") });

export const updatePreferences = async (c: Context<AppContext>) =>
  ok(await service.updatePreferences(c.env, actor(c), validateEmailPreferences(await body(c))), "Email notification preferences saved.", { requestId: c.get("requestId") });

export const settings = async (c: Context<AppContext>) =>
  ok(await service.getSettings(c.env, actor(c)), "Email notification settings loaded successfully.", { requestId: c.get("requestId") });

export const updateSettings = async (c: Context<AppContext>) =>
  ok(await service.updateSettings(c.env, actor(c), validateEmailSettings(await body(c))), "Email notification settings saved.", { requestId: c.get("requestId") });

export const templates = async (c: Context<AppContext>) =>
  ok(await service.listTemplates(), "Email templates loaded successfully.", { requestId: c.get("requestId") });

export const previewTemplate = async (c: Context<AppContext>) =>
  ok(await service.previewTemplate(c.env, actor(c), templateKey(c), validatePreviewVariables(await body(c))), "Email template preview generated.", { requestId: c.get("requestId") });
