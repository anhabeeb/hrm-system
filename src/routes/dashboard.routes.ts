import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/dashboard/dashboard.controller";
import type { AppContext } from "../types/api.types";

const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use("*", authMiddleware);

dashboardRoutes.get("/", requireAnyPermission(["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]), controller.summary);
dashboardRoutes.get("/summary", requireAnyPermission(["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]), controller.summary);
dashboardRoutes.get("/command-center", requireAnyPermission(["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]), controller.commandCenter);
dashboardRoutes.get("/attention", requireAnyPermission(["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]), controller.attention);
dashboardRoutes.get("/attendance-today", requireFeature("attendance"), requireAnyPermission(["dashboard.attendance.view", "attendance.view", "attendance.reports.view"]), controller.attendanceToday);
dashboardRoutes.get("/approvals", requireFeature("leave"), requireAnyPermission(["dashboard.leave.view", "leave.view", "leave.approvals.view"]), controller.approvals);
dashboardRoutes.get("/expiry-alerts", requireAnyPermission(["dashboard.expiry_alerts.view", "expiry_alerts.view", "expiry_alerts.view_own"]), controller.expiryAlerts);
dashboardRoutes.get("/device-health", requireFeature("biometric"), requireAnyPermission(["dashboard.device_health.view", "biometric.view", "devices.view_health", "sync.view_device_health"]), controller.deviceHealth);
dashboardRoutes.get("/payroll-readiness", requireFeature("payroll"), requireAnyPermission(["dashboard.payroll_readiness.view", "payroll.view", "long_leave.payroll_preview"]), controller.payrollReadiness);
dashboardRoutes.get("/quick-actions", requireAnyPermission(["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]), controller.quickActions);

export { dashboardRoutes };
