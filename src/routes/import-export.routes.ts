import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/import-export/import-export.controller";
import type { AppContext } from "../types/api.types";

const importExportRoutes = new Hono<AppContext>();

importExportRoutes.use("*", authMiddleware);
importExportRoutes.use("*", requireFeature("import_export"));

importExportRoutes.get("/exports", requirePermission("export.view"), controller.listExports);
importExportRoutes.post("/exports", requirePermission("export.create"), controller.createExport);
importExportRoutes.get("/exports/:id", requirePermission("export.view"), controller.getExport);
importExportRoutes.get("/exports/:id/download", requirePermission("export.download"), controller.downloadExport);
importExportRoutes.post("/exports/:id/cancel", requirePermission("export.create"), requireReason(), controller.cancelExport);
importExportRoutes.post("/exports/:id/retry", requirePermission("export.create"), requireReason(), controller.retryExport);

importExportRoutes.get("/imports", requirePermission("import.view"), controller.listImports);
importExportRoutes.post("/imports/upload", requirePermission("import.create"), requireReason(), controller.uploadImport);
importExportRoutes.get("/imports/:id", requirePermission("import.view"), controller.getImport);
importExportRoutes.post("/imports/:id/validate", requirePermission("import.create"), controller.validateImport);
importExportRoutes.post("/imports/:id/apply", requirePermission("import.confirm"), requireReason(), controller.applyImport);
importExportRoutes.post("/imports/:id/cancel", requirePermission("import.rollback"), requireReason(), controller.cancelImport);
importExportRoutes.get("/templates", requirePermission("import.download_template"), controller.templates);
importExportRoutes.get("/templates/:templateKey", requirePermission("import.download_template"), controller.templateDetail);

export { importExportRoutes };
