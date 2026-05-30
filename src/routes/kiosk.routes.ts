import { Hono } from "hono";

import { deviceAuthMiddleware } from "../middleware/device-auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import * as controller from "../modules/kiosk/kiosk.controller";
import type { AppContext } from "../types/api.types";

const kioskRoutes = new Hono<AppContext>();

kioskRoutes.use("*", deviceAuthMiddleware);
kioskRoutes.use("*", requireFeature("kiosk_attendance"));

kioskRoutes.get("/status", controller.status);
kioskRoutes.get("/employees", controller.employees);
kioskRoutes.post("/clock-in", controller.clockIn);
kioskRoutes.post("/clock-out", controller.clockOut);
kioskRoutes.get("/today", controller.today);
kioskRoutes.get("/device-summary", controller.deviceSummary);

export { kioskRoutes };
