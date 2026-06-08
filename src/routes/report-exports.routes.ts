import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/report-exports/report-exports.controller";
import type { AppContext } from "../types/api.types";

const reportExportsRoutes = new Hono<AppContext>();

reportExportsRoutes.use("*", authMiddleware);
reportExportsRoutes.use("*", requireFeature("reports"));

reportExportsRoutes.get("/catalog", requirePermission("report_exports.catalog.view"), controller.catalog);
reportExportsRoutes.get("/jobs", requireAnyPermission(["report_exports.history.view", "report_exports.admin.manage"]), controller.jobs);
reportExportsRoutes.get("/jobs/:id", requireAnyPermission(["report_exports.history.view", "report_exports.admin.manage"]), controller.getJob);
reportExportsRoutes.post("/preview", requirePermission("report_exports.preview"), controller.preview);
reportExportsRoutes.post("/jobs", requirePermission("report_exports.create"), controller.createJob);
reportExportsRoutes.post("/jobs/:id/generate", requirePermission("report_exports.create"), controller.generate);
reportExportsRoutes.get("/jobs/:id/download", requirePermission("report_exports.download"), controller.download);
reportExportsRoutes.post("/jobs/:id/cancel", requireAnyPermission(["report_exports.cancel", "report_exports.admin.manage"]), controller.cancel);
reportExportsRoutes.get("/print/:reportKey", requirePermission("report_exports.print"), controller.print);
reportExportsRoutes.get("/employee/:employeeId/print", requirePermission("report_exports.employee_profile.print"), controller.printEmployee);

export { reportExportsRoutes };

