import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { deviceAuthMiddleware } from "../middleware/device-auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/sync/sync.controller";
import type { AppContext } from "../types/api.types";

const syncRoutes = new Hono<AppContext>();

syncRoutes.post("/push", deviceAuthMiddleware, requireFeature("offline_sync"), controller.push);
syncRoutes.get("/pull", deviceAuthMiddleware, requireFeature("offline_sync"), controller.pull);

syncRoutes.get("/status", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.view"), controller.status);
syncRoutes.post("/retry", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.retry"), requireReason(), controller.retry);
syncRoutes.post("/force-resync", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.force_resync"), requireReason(), controller.forceResync);
syncRoutes.get("/conflicts", authMiddleware, requireFeature("offline_sync"), requireAnyPermission(["sync.view", "sync.resolve_conflicts"]), controller.listConflicts);
syncRoutes.get("/conflicts/:id", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.view"), controller.getConflict);
syncRoutes.post("/conflicts/:id/resolve", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.resolve_conflicts"), requireReason({ fields: ["reason", "resolution_notes"] }), controller.resolveConflict);
syncRoutes.get("/batches", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.view"), controller.listBatches);
syncRoutes.get("/batches/:id", authMiddleware, requireFeature("offline_sync"), requirePermission("sync.view"), controller.getBatch);
syncRoutes.get("/health", authMiddleware, requireFeature("offline_sync"), requireAnyPermission(["sync.view_device_health", "sync.view"]), controller.health);

export { syncRoutes };
