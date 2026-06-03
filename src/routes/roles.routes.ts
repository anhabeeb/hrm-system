import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/roles/roles.controller";
import type { AppContext } from "../types/api.types";

const rolesRoutes = new Hono<AppContext>();

rolesRoutes.use("*", authMiddleware);
rolesRoutes.get("/", requirePermission("roles.view"), controller.listRoles);
rolesRoutes.get("/:id", requirePermission("roles.view"), controller.getRole);

export { rolesRoutes };
