import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { deviceAuthMiddleware } from "../middleware/device-auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/biometric/biometric.controller";
import type { AppContext } from "../types/api.types";

const biometricRoutes = new Hono<AppContext>();

biometricRoutes.post("/punch", deviceAuthMiddleware, requireFeature("biometric_attendance"), controller.punch);
biometricRoutes.post("/punches", deviceAuthMiddleware, requireFeature("biometric_attendance"), controller.punch);
biometricRoutes.post("/batch", deviceAuthMiddleware, requireFeature("biometric_attendance"), controller.batch);
biometricRoutes.post("/bridge/batch", deviceAuthMiddleware, requireFeature("biometric_attendance"), controller.bridgeBatch);
biometricRoutes.get("/device-status", deviceAuthMiddleware, requireFeature("biometric_attendance"), controller.deviceStatus);

biometricRoutes.use("*", authMiddleware);
biometricRoutes.use("*", requireFeature("biometric_attendance"));

biometricRoutes.get("/devices", requireAnyPermission(["biometric.view", "biometric.manage_devices"]), controller.listDevices);
biometricRoutes.get("/devices/:id", requirePermission("biometric.view"), controller.getDevice);
biometricRoutes.post("/devices", requirePermission("biometric.manage_devices"), controller.registerDevice);
biometricRoutes.patch("/devices/:id", requirePermission("biometric.manage_devices"), controller.updateDevice);
biometricRoutes.post("/devices/:id/enable", requirePermission("biometric.enable_disable_device"), requireReason(), controller.enableDevice);
biometricRoutes.post("/devices/:id/disable", requirePermission("biometric.enable_disable_device"), requireReason(), controller.disableDevice);
biometricRoutes.post("/devices/:id/revoke", requireAnyPermission(["biometric.enable_disable_device", "devices.revoke"]), requireReason(), controller.revokeDevice);
biometricRoutes.post("/devices/:id/rotate-token", requirePermission("biometric.manage_devices"), requireReason(), controller.rotateDeviceToken);

biometricRoutes.get("/mappings", requireAnyPermission(["biometric.view", "biometric.map_employee"]), controller.listMappings);
biometricRoutes.post("/mappings", requirePermission("biometric.map_employee"), controller.createMapping);
biometricRoutes.patch("/mappings/:id", requirePermission("biometric.map_employee"), controller.updateMapping);
biometricRoutes.post("/mappings/:id/disable", requirePermission("biometric.map_employee"), requireReason(), controller.disableMapping);

biometricRoutes.get("/logs", requirePermission("biometric.view_logs"), controller.listLogs);
biometricRoutes.get("/logs/:id", requirePermission("biometric.view_logs"), controller.getLog);
biometricRoutes.post("/logs/:id/reprocess", requireAnyPermission(["biometric.resolve_unmatched", "biometric.sync"]), requireReason(), controller.reprocessLog);
biometricRoutes.post("/logs/:id/reject", requireAnyPermission(["biometric.resolve_punches", "biometric.resolve_unmatched"]), requireReason(), controller.rejectLog);
biometricRoutes.get("/unmatched", requireAnyPermission(["biometric.resolve_unmatched", "biometric.view_logs"]), controller.unmatched);
biometricRoutes.post("/unmatched/:logId/map", requireAnyPermission(["biometric.resolve_punches", "biometric.resolve_unmatched"]), requireReason(), controller.mapUnmatched);

export { biometricRoutes };
