import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/company/company.controller";
import type { AppContext } from "../types/api.types";

const companyRoutes = new Hono<AppContext>();

companyRoutes.use("*", authMiddleware);

companyRoutes.get(
  "/profile",
  requireAnyPermission(["company.view", "settings.view"]),
  controller.getProfile,
);

companyRoutes.patch(
  "/profile",
  requireAnyPermission(["company.manage", "settings.manage"]),
  requireReason(),
  controller.updateProfile,
);

export { companyRoutes };
