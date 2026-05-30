import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/documents/documents.controller";
import type { AppContext } from "../types/api.types";

const documentsRoutes = new Hono<AppContext>();

documentsRoutes.use("*", authMiddleware);
documentsRoutes.use("*", requireFeature("documents"));

documentsRoutes.get("/", requirePermission("documents.view"), controller.listDocuments);
documentsRoutes.post("/", requirePermission("documents.upload"), controller.uploadDocument);
documentsRoutes.post("/upload", requirePermission("documents.upload"), controller.uploadDocument);
documentsRoutes.get("/expiring", requirePermission("documents.view_expiring"), controller.expiringDocuments);
documentsRoutes.get("/missing", requirePermission("documents.view_missing"), controller.missingDocuments);
documentsRoutes.get("/categories", requireAnyPermission(["documents_settings.manage", "documents.view"]), controller.listCategories);
documentsRoutes.post("/categories", requirePermission("documents_settings.manage"), controller.createCategory);
documentsRoutes.patch("/categories/:id", requirePermission("documents_settings.manage"), controller.updateCategory);
documentsRoutes.get("/:id", requirePermission("documents.view"), controller.getDocument);
documentsRoutes.patch("/:id", requirePermission("documents.edit"), controller.updateDocument);
documentsRoutes.delete("/:id", requirePermission("documents.delete"), requireReason(), controller.deleteDocument);
documentsRoutes.get("/:id/download", requirePermission("documents.download"), controller.downloadDocument);

export { documentsRoutes };
