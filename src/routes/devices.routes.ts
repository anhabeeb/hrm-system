import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { deviceAuthMiddleware } from "../middleware/device-auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/devices/devices.controller";
import type { AppContext } from "../types/api.types";

const devicesRoutes = new Hono<AppContext>();

devicesRoutes.post("/:id/heartbeat", deviceAuthMiddleware, requireFeature("offline_sync"), controller.heartbeat);

devicesRoutes.use("*", authMiddleware);
devicesRoutes.use("*", requireFeature("offline_sync"));

devicesRoutes.get("/", requirePermission("devices.view"), controller.listDevices);
devicesRoutes.get("/:id", requirePermission("devices.view"), controller.getDevice);
devicesRoutes.post("/register", requireAnyPermission(["devices.register", "sync.register_device"]), controller.register);
devicesRoutes.patch("/:id", requirePermission("devices.edit"), controller.update);
devicesRoutes.post("/:id/enable", requirePermission("devices.enable"), requireReason(), controller.enable);
devicesRoutes.post("/:id/disable", requireAnyPermission(["devices.disable", "sync.disable_device"]), requireReason(), controller.disable);
devicesRoutes.post("/:id/rotate-token", requirePermission("devices.rotate_token"), requireReason(), controller.rotateToken);
devicesRoutes.get("/:id/health", requireAnyPermission(["devices.view_health", "sync.view_device_health"]), controller.health);

export { devicesRoutes };
