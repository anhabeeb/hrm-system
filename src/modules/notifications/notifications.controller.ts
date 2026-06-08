import type { Context } from "hono";

import * as service from "./notifications.service";
import { validateNotificationFilters, validatePreferences } from "./notifications.validators";
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
  if (!value) throw new ValidationError("Notification is required.");
  return value;
};

const query = (c: Context<AppContext>) => validateNotificationFilters({
  status: c.req.query("status"),
  category: c.req.query("category"),
  priority: c.req.query("priority"),
  notification_type: c.req.query("notification_type"),
  entity_type: c.req.query("entity_type"),
  entity_id: c.req.query("entity_id"),
  from_date: c.req.query("from_date"),
  to_date: c.req.query("to_date"),
  unread_only: c.req.query("unread_only"),
  include_archived: c.req.query("include_archived"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listNotifications = async (c: Context<AppContext>) => {
  const result = await service.listNotifications(c.env, actor(c), query(c));
  return paginated(result.rows, result.pagination, "Notifications loaded successfully.", { requestId: c.get("requestId") });
};

export const unreadCount = async (c: Context<AppContext>) =>
  ok(await service.getUnreadCount(c.env, actor(c)), "Notification unread count loaded successfully.", { requestId: c.get("requestId") });

export const getNotification = async (c: Context<AppContext>) =>
  ok(await service.getNotification(c.env, actor(c), id(c)), "Notification loaded successfully.", { requestId: c.get("requestId") });

export const markRead = async (c: Context<AppContext>) =>
  ok(await service.markRead(c.env, actor(c), id(c)), "Notification marked as read.", { requestId: c.get("requestId") });

export const markUnread = async (c: Context<AppContext>) =>
  ok(await service.markUnread(c.env, actor(c), id(c)), "Notification marked as unread.", { requestId: c.get("requestId") });

export const archive = async (c: Context<AppContext>) =>
  ok(await service.archive(c.env, actor(c), id(c)), "Notification archived.", { requestId: c.get("requestId") });

export const dismiss = async (c: Context<AppContext>) =>
  ok(await service.dismiss(c.env, actor(c), id(c)), "Notification dismissed.", { requestId: c.get("requestId") });

export const markAllRead = async (c: Context<AppContext>) =>
  ok(await service.markAllRead(c.env, actor(c), query(c)), "Notifications marked as read.", { requestId: c.get("requestId") });

export const preferences = async (c: Context<AppContext>) =>
  ok(await service.getPreferences(c.env, actor(c)), "Notification preferences loaded successfully.", { requestId: c.get("requestId") });

export const updatePreferences = async (c: Context<AppContext>) =>
  ok(await service.updatePreferences(c.env, actor(c), validatePreferences(await body(c))), "Notification preferences saved.", { requestId: c.get("requestId") });
