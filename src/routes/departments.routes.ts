import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/departments/departments.controller";
import type { AppContext } from "../types/api.types";

const departmentsRoutes = new Hono<AppContext>();
departmentsRoutes.use("*", authMiddleware);
departmentsRoutes.use("*", requireFeature("employee_management"));
departmentsRoutes.get("/", requirePermission("departments.view"), controller.listDepartments);
departmentsRoutes.post("/", requirePermission("departments.create"), controller.createDepartment);
departmentsRoutes.get("/:id", requirePermission("departments.view"), controller.getDepartment);
departmentsRoutes.patch("/:id", requirePermission("departments.edit"), controller.updateDepartment);
departmentsRoutes.delete("/:id", requirePermission("departments.delete"), requireReason(), controller.deleteDepartment);

export { departmentsRoutes };
