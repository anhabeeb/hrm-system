import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/imports/imports.controller";
import type { AppContext } from "../types/api.types";

const importsRoutes = new Hono<AppContext>();

importsRoutes.use("*", authMiddleware);
importsRoutes.use("*", requireFeature("import_export"));

importsRoutes.get("/templates", requirePermission("imports.templates.view"), controller.templates);
importsRoutes.get("/templates/:importType", requirePermission("imports.templates.view"), controller.templateDetail);
importsRoutes.get("/templates/:importType/csv", requirePermission("imports.templates.view"), controller.templateCsv);
importsRoutes.get("/jobs", requirePermission("imports.view"), controller.jobs);
importsRoutes.get("/jobs/:id", requirePermission("imports.view"), controller.getJob);
importsRoutes.post("/jobs", requirePermission("imports.upload"), controller.createJob);
importsRoutes.post("/jobs/:id/validate", requirePermission("imports.preview"), controller.validateJob);
importsRoutes.post("/jobs/:id/apply", requirePermission("imports.apply"), controller.applyJob);
importsRoutes.post("/jobs/:id/cancel", requirePermission("imports.cancel"), controller.cancelJob);
importsRoutes.get("/jobs/:id/rows", requireAnyPermission(["imports.errors.view", "imports.view"]), controller.rows);
importsRoutes.get("/jobs/:id/errors", requirePermission("imports.errors.view"), controller.errors);
importsRoutes.post("/preview", requirePermission("imports.preview"), controller.preview);

export { importsRoutes };
