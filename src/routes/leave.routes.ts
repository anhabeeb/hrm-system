import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/leave/leave.controller";
import type { AppContext } from "../types/api.types";

const leaveRoutes = new Hono<AppContext>();

leaveRoutes.use("*", authMiddleware);
leaveRoutes.use("*", requireFeature("leave_management"));

leaveRoutes.get("/types", requireAnyPermission(["leave.view", "leave_settings.view"]), controller.listTypes);
leaveRoutes.patch("/types/:id", requireAnyPermission(["leave_settings.manage", "leave_types.enable_disable"]), requireReason(), controller.updateType);

leaveRoutes.get("/policies", requireAnyPermission(["leave.view", "leave_settings.view"]), controller.listPolicies);
leaveRoutes.post("/policies", requireAnyPermission(["leave_settings.manage", "leave_policy_limits.edit"]), requireReason(), controller.createPolicy);
leaveRoutes.patch("/policies/:id", requireAnyPermission(["leave_settings.manage", "leave_policy_limits.edit"]), requireReason(), controller.updatePolicy);

leaveRoutes.get("/balances", requireAnyPermission(["leave.view", "leave.manage_balances"]), controller.listBalances);
leaveRoutes.get("/balances/:employeeId", requirePermission("leave.view"), controller.getEmployeeBalances);
leaveRoutes.post("/balances/:employeeId/adjust", requireAnyPermission(["leave.manage_balances", "leave_policy_override.manage"]), requireReason(), controller.adjustBalance);

leaveRoutes.get("/requests", requirePermission("leave.view"), controller.listRequests);
leaveRoutes.get("/requests/:id", requirePermission("leave.view"), controller.getRequest);
leaveRoutes.post("/requests", requirePermission("leave.create"), controller.createRequest);
leaveRoutes.patch("/requests/:id", requirePermission("leave.edit"), controller.updateRequest);
leaveRoutes.post("/requests/:id/approve", requirePermission("leave.approve"), requireReason(), controller.approveRequest);
leaveRoutes.post("/requests/:id/reject", requirePermission("leave.reject"), requireReason(), controller.rejectRequest);
leaveRoutes.post("/requests/:id/cancel", requireAnyPermission(["leave.cancel", "leave.edit"]), requireReason(), controller.cancelRequest);

leaveRoutes.get("/calendar", requirePermission("leave.view"), controller.calendar);

export { leaveRoutes };
