import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/self-service/self-service.controller";
import type { AppContext } from "../types/api.types";

const selfServiceRoutes = new Hono<AppContext>();

selfServiceRoutes.use("*", authMiddleware);

selfServiceRoutes.get("/dashboard", requirePermission("self.dashboard.view"), controller.dashboard);
selfServiceRoutes.get("/profile", requireAnyPermission(["self.profile.view", "self.dashboard.view"]), controller.profile);
selfServiceRoutes.get("/access-summary", requirePermission("self.accessSummary.view"), controller.accessSummary);
selfServiceRoutes.get("/requests", requirePermission("self.requests.view"), controller.requests);
selfServiceRoutes.get("/pending-approvals", requireAnyPermission(["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]), controller.pendingApprovals);
selfServiceRoutes.get("/navigation", requireAnyPermission(["self.dashboard.view", "self.profile.view", "self.requests.view"]), controller.navigation);

export { selfServiceRoutes };
