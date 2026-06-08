import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/notifications/notifications.controller";
import type { AppContext } from "../types/api.types";

const notificationsRoutes = new Hono<AppContext>();

notificationsRoutes.use("*", authMiddleware);

notificationsRoutes.get("/", requireAnyPermission(["notifications.view", "notifications.manage_own"]), controller.listNotifications);
notificationsRoutes.get("/unread-count", requireAnyPermission(["notifications.view", "notifications.manage_own"]), controller.unreadCount);
notificationsRoutes.get("/preferences", requireAnyPermission(["notifications.preferences.manage", "notifications.manage_own", "notifications.view"]), controller.preferences);
notificationsRoutes.patch("/preferences", requireAnyPermission(["notifications.preferences.manage", "notifications.manage_own"]), controller.updatePreferences);
notificationsRoutes.post("/mark-all-read", requireAnyPermission(["notifications.mark_read", "notifications.manage_own"]), controller.markAllRead);
notificationsRoutes.get("/:id", requireAnyPermission(["notifications.view", "notifications.manage_own"]), controller.getNotification);
notificationsRoutes.post("/:id/read", requireAnyPermission(["notifications.mark_read", "notifications.manage_own"]), controller.markRead);
notificationsRoutes.post("/:id/unread", requireAnyPermission(["notifications.mark_read", "notifications.manage_own"]), controller.markUnread);
notificationsRoutes.post("/:id/archive", requireAnyPermission(["notifications.archive", "notifications.manage_own"]), controller.archive);
notificationsRoutes.post("/:id/dismiss", requireAnyPermission(["notifications.archive", "notifications.manage_own"]), controller.dismiss);

export { notificationsRoutes };
