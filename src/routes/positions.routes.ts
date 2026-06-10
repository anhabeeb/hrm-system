import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/positions/positions.controller";
import type { AppContext } from "../types/api.types";

const positionsRoutes = new Hono<AppContext>();
positionsRoutes.use("*", authMiddleware);
positionsRoutes.use("*", requireFeature("employee_management"));
positionsRoutes.get("/", requirePermission("positions.view"), controller.listPositions);
positionsRoutes.post("/", requirePermission("positions.create"), controller.createPosition);
positionsRoutes.get("/:id", requirePermission("positions.view"), controller.getPosition);
positionsRoutes.patch("/:id", requirePermission("positions.edit"), controller.updatePosition);
positionsRoutes.post("/:id/disable", requirePermission("positions.edit"), requireReason(), controller.disablePosition);
positionsRoutes.post("/:id/enable", requirePermission("positions.edit"), requireReason(), controller.enablePosition);
positionsRoutes.post("/:id/archive", requirePermission("positions.delete"), requireReason(), controller.archivePosition);
positionsRoutes.delete("/:id", requirePermission("positions.delete"), requireReason(), controller.deletePosition);

export { positionsRoutes };
