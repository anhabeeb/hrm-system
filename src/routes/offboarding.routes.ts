import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import * as controller from "../modules/offboarding/offboarding.controller";
import type { AppContext } from "../types/api.types";

const offboardingRoutes = new Hono<AppContext>();

offboardingRoutes.use("*", authMiddleware);
offboardingRoutes.use("*", requireFeature("employee_management"));

offboardingRoutes.get(
  "/",
  requireAnyPermissionOrError(["employees.offboarding.view", "offboarding.view", "employees.view"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to view offboarding cases.",
  }),
  controller.listCases,
);

export { offboardingRoutes };
