import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/expiry-alerts/expiry-alerts.controller";
import type { AppContext } from "../types/api.types";

const expiryAlertsRoutes = new Hono<AppContext>();

expiryAlertsRoutes.use("*", authMiddleware);

expiryAlertsRoutes.get("/", requireAnyPermission(["expiry_alerts.view", "expiry_alerts.view_own"]), controller.listAlerts);
expiryAlertsRoutes.get("/summary", requireAnyPermission(["expiry_alerts.view", "expiry_alerts.view_own"]), controller.summary);
expiryAlertsRoutes.get("/settings", requireAnyPermission(["expiry_alerts.view", "expiry_alerts.settings.manage"]), controller.settings);
expiryAlertsRoutes.patch("/settings", requireAnyPermission(["expiry_alerts.settings.manage"]), controller.updateSettings);
expiryAlertsRoutes.post("/scan/preview", requireAnyPermission(["expiry_alerts.scan", "expiry_alerts.view"]), controller.previewScan);
expiryAlertsRoutes.post("/scan/run", requireAnyPermission(["expiry_alerts.scan", "expiry_alerts.manage"]), controller.runScan);
expiryAlertsRoutes.get("/:id", requireAnyPermission(["expiry_alerts.view", "expiry_alerts.view_own"]), controller.getAlert);
expiryAlertsRoutes.post("/:id/acknowledge", requireAnyPermission(["expiry_alerts.acknowledge", "expiry_alerts.manage"]), controller.acknowledge);
expiryAlertsRoutes.post("/:id/resolve", requireAnyPermission(["expiry_alerts.resolve", "expiry_alerts.manage"]), controller.resolve);
expiryAlertsRoutes.post("/:id/dismiss", requireAnyPermission(["expiry_alerts.dismiss", "expiry_alerts.manage"]), controller.dismiss);
expiryAlertsRoutes.post("/:id/snooze", requireAnyPermission(["expiry_alerts.snooze", "expiry_alerts.manage"]), controller.snooze);

export { expiryAlertsRoutes };
