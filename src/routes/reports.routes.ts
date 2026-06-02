import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/reports/reports.controller";
import type { AppContext } from "../types/api.types";

const reportsRoutes = new Hono<AppContext>();

reportsRoutes.use("*", authMiddleware);
reportsRoutes.use("*", requireFeature("reports"));

reportsRoutes.get("/", requirePermission("reports.view"), controller.listReports);
reportsRoutes.get("/catalog", requirePermission("reports.view"), controller.catalog);
reportsRoutes.post("/generate", requirePermission("reports.view"), controller.generate);
reportsRoutes.get("/dashboard/summary", requirePermission("reports.view"), controller.dashboardSummary);
reportsRoutes.get("/employees/summary", requirePermission("reports.view"), requirePermission("employees.view"), controller.employeeSummary);
reportsRoutes.get("/attendance/summary", requirePermission("reports.view"), requirePermission("attendance.view"), controller.attendanceSummary);
reportsRoutes.get("/leave/summary", requirePermission("reports.view"), requirePermission("leave.view"), controller.leaveSummary);
reportsRoutes.get("/payroll/summary", requirePermission("reports.view"), requirePermission("payroll.view"), controller.payrollSummary);
reportsRoutes.get("/assets/summary", requirePermission("reports.view"), requirePermission("assets.view"), controller.assetSummary);
reportsRoutes.get("/documents/summary", requirePermission("reports.view"), requirePermission("documents.view"), controller.documentSummary);
reportsRoutes.get("/compliance/expiring-documents", requirePermission("reports.view"), requirePermission("documents.view"), controller.expiringDocuments);
reportsRoutes.get("/compliance/missing-documents", requirePermission("reports.view"), requirePermission("documents.view"), controller.missingDocuments);
reportsRoutes.get("/audit/activity", requirePermission("reports.view"), requirePermission("audit_logs.view"), controller.auditActivity);
reportsRoutes.get("/devices/health", requirePermission("reports.view"), requireAnyPermission(["devices.view_health", "sync.view_device_health"]), controller.deviceHealth);
reportsRoutes.get("/sync/status", requirePermission("reports.view"), requirePermission("sync.view"), controller.syncStatus);
reportsRoutes.get("/:reportKey", requirePermission("reports.view"), controller.getByKey);

export { reportsRoutes };
