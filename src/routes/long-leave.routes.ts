import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/long-leave/long-leave.controller";
import type { AppContext } from "../types/api.types";

const longLeaveRoutes = new Hono<AppContext>();

longLeaveRoutes.use("*", authMiddleware);
longLeaveRoutes.use("*", requireFeature("long_leave"));

longLeaveRoutes.get("/", requirePermission("long_leave.view"), controller.listLongLeave);
longLeaveRoutes.get("/settings-preview", requireAnyPermission(["long_leave.view", "long_leave.settings.manage"]), controller.settingsPreview);
longLeaveRoutes.get("/:id", requirePermission("long_leave.view"), controller.getLongLeave);
longLeaveRoutes.post("/", requirePermission("long_leave.create"), requireReason(), controller.createLongLeave);
longLeaveRoutes.get("/:id/salary-impact", requirePermission("long_leave.view"), controller.getSalaryImpact);
longLeaveRoutes.post("/:id/calculate-salary-impact", requireAnyPermission(["long_leave.approve_salary_impact", "long_leave.confirm_salary_impact"]), controller.calculateSalaryImpact);
longLeaveRoutes.post("/:id/confirm-salary-impact", requirePermission("long_leave.confirm_salary_impact"), requireReason(), controller.confirmSalaryImpact);
longLeaveRoutes.post("/:id/approve", requirePermission("long_leave.approve"), requireReason(), controller.approveLongLeave);
longLeaveRoutes.post("/:id/reject", requirePermission("long_leave.reject"), requireReason(), controller.rejectLongLeave);
longLeaveRoutes.post("/:id/return", requirePermission("long_leave.return_confirm"), requireReason(), controller.returnFromLongLeave);
longLeaveRoutes.post("/:id/override", requirePermission("long_leave.override"), requireReason(), controller.overrideImpact);

export { longLeaveRoutes };
