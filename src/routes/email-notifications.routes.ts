import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/email-notifications/email-notifications.controller";
import type { AppContext } from "../types/api.types";

const emailNotificationsRoutes = new Hono<AppContext>();

emailNotificationsRoutes.use("*", authMiddleware);

emailNotificationsRoutes.get("/", requireAnyPermission(["email_notifications.view_own", "email_notifications.admin.view"]), controller.listEmailJobs);
emailNotificationsRoutes.get("/preferences", requireAnyPermission(["email_notifications.preferences.manage", "email_notifications.view_own"]), controller.preferences);
emailNotificationsRoutes.patch("/preferences", requireAnyPermission(["email_notifications.preferences.manage", "email_notifications.view_own"]), controller.updatePreferences);
emailNotificationsRoutes.get("/settings", requireAnyPermission(["email_notifications.settings.manage", "email_notifications.admin.view"]), controller.settings);
emailNotificationsRoutes.patch("/settings", requireAnyPermission(["email_notifications.settings.manage", "email_notifications.admin.manage"]), controller.updateSettings);
emailNotificationsRoutes.post("/process-pending", requireAnyPermission(["email_notifications.process", "email_notifications.admin.manage"]), controller.processPending);
emailNotificationsRoutes.get("/templates", requireAnyPermission(["email_notifications.templates.view", "email_notifications.admin.view"]), controller.templates);
emailNotificationsRoutes.get("/templates/:templateKey/preview", requireAnyPermission(["email_notifications.templates.view", "email_notifications.admin.view"]), controller.previewTemplate);
emailNotificationsRoutes.post("/templates/:templateKey/preview", requireAnyPermission(["email_notifications.templates.view", "email_notifications.admin.view"]), controller.previewTemplate);
emailNotificationsRoutes.get("/:id", requireAnyPermission(["email_notifications.view_own", "email_notifications.admin.view"]), controller.getEmailJob);
emailNotificationsRoutes.post("/:id/retry", requireAnyPermission(["email_notifications.retry", "email_notifications.admin.manage"]), controller.retryEmailJob);

export { emailNotificationsRoutes };
