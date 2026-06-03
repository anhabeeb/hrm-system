import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/users/users.controller";
import type { AppContext } from "../types/api.types";

const usersRoutes = new Hono<AppContext>();

usersRoutes.use("*", authMiddleware);
usersRoutes.get("/", requirePermission("users.view"), controller.listUsers);
usersRoutes.post("/", requirePermission("users.create"), controller.createUser);
usersRoutes.get("/:id", requirePermission("users.view"), controller.getUser);
usersRoutes.patch("/:id", requirePermission("users.edit"), controller.updateUser);
usersRoutes.post("/:id/enable", requireAnyPermission(["users.enable", "users.edit"]), requireReason(), controller.enableUser);
usersRoutes.post("/:id/disable", requireAnyPermission(["users.disable", "users.edit"]), requireReason(), controller.disableUser);
usersRoutes.post("/:id/reset-password", requireAnyPermission(["users.reset_password", "users.edit"]), requireReason(), controller.resetPassword);
usersRoutes.post("/:id/roles", requireAnyPermission(["users.edit", "roles.edit"]), requireReason(), controller.assignRoles);

export { usersRoutes };
