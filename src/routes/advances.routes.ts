import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/advances/advances.controller";
import type { AppContext } from "../types/api.types";

const advancesRoutes = new Hono<AppContext>();

advancesRoutes.use("*", authMiddleware);
advancesRoutes.use("*", requireFeature("payroll"));

advancesRoutes.get("/", requirePermission("advances.view"), controller.listAdvances);
advancesRoutes.get("/:id", requirePermission("advances.view"), controller.getAdvance);
advancesRoutes.post("/", requirePermission("advances.create"), requireReason(), controller.createAdvance);
advancesRoutes.patch("/:id", requirePermission("advances.edit"), requireReason(), controller.updateAdvance);
advancesRoutes.post("/:id/approve", requirePermission("advances.approve"), requireReason(), controller.approveAdvance);
advancesRoutes.post("/:id/reject", requirePermission("advances.reject"), requireReason(), controller.rejectAdvance);

export { advancesRoutes };
