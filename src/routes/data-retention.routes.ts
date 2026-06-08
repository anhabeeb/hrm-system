import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/data-retention/data-retention.controller";
import type { AppContext } from "../types/api.types";

const dataRetentionRoutes = new Hono<AppContext>();

dataRetentionRoutes.use("*", authMiddleware);
dataRetentionRoutes.use("*", requireFeature("backup_recovery"));

dataRetentionRoutes.get("/settings", requireAnyPermission(["data_retention.view", "data_retention.settings.manage"]), controller.settings);
dataRetentionRoutes.patch("/settings", requirePermission("data_retention.settings.manage"), requireReason(), controller.updateSettings);
dataRetentionRoutes.get("/policies", requireAnyPermission(["data_retention.view", "data_retention.settings.manage"]), controller.policies);
dataRetentionRoutes.get("/archive-jobs", requirePermission("data_retention.view"), controller.jobs);
dataRetentionRoutes.get("/archive-jobs/:id", requirePermission("data_retention.view"), controller.getJob);
dataRetentionRoutes.post("/archive-jobs/preview", requirePermission("data_retention.preview"), controller.preview);
dataRetentionRoutes.post("/archive-jobs/:id/apply", requirePermission("data_retention.archive"), requireReason(), controller.apply);
dataRetentionRoutes.post("/archive-jobs/:id/cancel", requirePermission("data_retention.cancel_job"), requireReason(), controller.cancel);
dataRetentionRoutes.get("/archive-jobs/:id/items", requirePermission("data_retention.view"), controller.items);
dataRetentionRoutes.post("/items/:sourceType/:sourceId/archive", requirePermission("data_retention.archive"), requireReason(), controller.archiveItem);
dataRetentionRoutes.post("/items/:sourceType/:sourceId/restore", requirePermission("data_retention.restore"), requireReason(), controller.restoreItem);
dataRetentionRoutes.get("/summary", requirePermission("data_retention.view"), controller.summary);

export { dataRetentionRoutes };
