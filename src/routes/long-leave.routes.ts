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
longLeaveRoutes.get("/settings", requireAnyPermission(["long_leave.view", "long_leave.settings.manage"]), controller.getSettings);
longLeaveRoutes.patch("/settings", requirePermission("long_leave.settings.manage"), requireReason(), controller.updateSettings);
longLeaveRoutes.get("/settings-preview", requireAnyPermission(["long_leave.view", "long_leave.settings.manage"]), controller.settingsPreview);
longLeaveRoutes.get("/:id", requirePermission("long_leave.view"), controller.getLongLeave);
longLeaveRoutes.post("/", requirePermission("long_leave.create"), requireReason(), controller.createLongLeave);
longLeaveRoutes.patch("/:id", requirePermission("long_leave.edit"), requireReason(), controller.updateLongLeave);
longLeaveRoutes.get("/:id/salary-impact", requirePermission("long_leave.view"), controller.getSalaryImpact);
longLeaveRoutes.get("/:id/timeline", requireAnyPermission(["long_leave.timeline.view", "long_leave.view"]), controller.timeline);
longLeaveRoutes.post("/:id/submit", requirePermission("long_leave.submit"), requireReason(), controller.submitLongLeave);
longLeaveRoutes.post("/:id/calculate-salary-impact", requireAnyPermission(["long_leave.approve_salary_impact", "long_leave.confirm_salary_impact"]), controller.calculateSalaryImpact);
longLeaveRoutes.post("/:id/payroll-preview", requireAnyPermission(["long_leave.payroll_preview", "long_leave.approve_salary_impact", "long_leave.view"]), controller.payrollPreview);
longLeaveRoutes.post("/:id/payroll-apply", requireAnyPermission(["long_leave.payroll_apply", "long_leave.confirm_salary_impact"]), requireReason(), controller.payrollApply);
longLeaveRoutes.post("/:id/confirm-salary-impact", requirePermission("long_leave.confirm_salary_impact"), requireReason(), controller.confirmSalaryImpact);
longLeaveRoutes.post("/:id/approve", requirePermission("long_leave.approve"), requireReason(), controller.approveLongLeave);
longLeaveRoutes.post("/:id/reject", requirePermission("long_leave.reject"), requireReason(), controller.rejectLongLeave);
longLeaveRoutes.post("/:id/cancel", requirePermission("long_leave.cancel"), requireReason(), controller.cancelLongLeave);
longLeaveRoutes.post("/:id/extend", requirePermission("long_leave.extend"), requireReason(), controller.extendLongLeave);
longLeaveRoutes.post("/:id/return", requireAnyPermission(["long_leave.return", "long_leave.return_confirm"]), requireReason(), controller.returnFromLongLeave);
longLeaveRoutes.post("/:id/override", requirePermission("long_leave.override"), requireReason(), controller.overrideImpact);

export { longLeaveRoutes };
