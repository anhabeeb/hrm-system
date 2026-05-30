import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as outletsController from "../modules/outlets/outlets.controller";
import type { AppContext } from "../types/api.types";

const outletsRoutes = new Hono<AppContext>();

outletsRoutes.use("*", authMiddleware);
outletsRoutes.use("*", requireFeature("employee_management"));
outletsRoutes.get("/", requirePermission("outlets.view"), outletsController.listOutlets);
outletsRoutes.post("/", requirePermission("outlets.create"), outletsController.createOutlet);
outletsRoutes.get("/:id", requirePermission("outlets.view"), outletsController.getOutlet);
outletsRoutes.patch("/:id", requirePermission("outlets.edit"), outletsController.updateOutlet);
outletsRoutes.post("/:id/enable", requirePermission("outlets.enable_disable"), requireReason(), outletsController.enableOutlet);
outletsRoutes.post("/:id/disable", requirePermission("outlets.enable_disable"), requireReason(), outletsController.disableOutlet);

export { outletsRoutes };
