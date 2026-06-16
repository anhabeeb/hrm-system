import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/navigation/navigation.controller";
import type { AppContext } from "../types/api.types";

const navigationRoutes = new Hono<AppContext>();

navigationRoutes.use("*", authMiddleware);
navigationRoutes.get(
  "/badges",
  requireAnyPermission(["dashboard.view", "self.dashboard.view", "self.requests.view", "approvals.view", "attendance.view", "documents.view", "rosters.view", "payroll.view", "expiry_alerts.view"]),
  controller.badges,
);

export { navigationRoutes };
