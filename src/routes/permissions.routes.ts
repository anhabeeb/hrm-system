import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as controller from "../modules/permissions/permissions.controller";
import type { AppContext } from "../types/api.types";

const permissionsRoutes = new Hono<AppContext>();

permissionsRoutes.use("*", authMiddleware);
permissionsRoutes.get("/", requireAnyPermission(["permissions.view", "roles.view"]), controller.listPermissions);

export { permissionsRoutes };
