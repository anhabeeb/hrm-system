import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/rosters/rosters.controller";
import type { AppContext } from "../types/api.types";

const shiftTemplatesRoutes = new Hono<AppContext>();

shiftTemplatesRoutes.use("*", authMiddleware);
shiftTemplatesRoutes.use("*", requireFeature("roster"));

shiftTemplatesRoutes.get(
  "/",
  requireAnyPermissionOrError(["shift_templates.view", "rosters.view", "roster.view"], {
    code: "SHIFT_TEMPLATE_PERMISSION_DENIED",
    message: "You do not have permission to view shift templates.",
  }),
  controller.listShiftTemplates,
);
shiftTemplatesRoutes.post(
  "/",
  requireAnyPermissionOrError(["shift_templates.manage", "rosters.manage", "roster.create", "roster.edit"], {
    code: "SHIFT_TEMPLATE_PERMISSION_DENIED",
    message: "You do not have permission to manage shift templates.",
  }),
  controller.createShiftTemplate,
);
shiftTemplatesRoutes.get("/:id", controller.getShiftTemplate);
shiftTemplatesRoutes.patch(
  "/:id",
  requireAnyPermissionOrError(["shift_templates.manage", "rosters.manage", "roster.edit"], {
    code: "SHIFT_TEMPLATE_PERMISSION_DENIED",
    message: "You do not have permission to manage shift templates.",
  }),
  controller.updateShiftTemplate,
);
shiftTemplatesRoutes.post(
  "/:id/disable",
  requireAnyPermissionOrError(["shift_templates.manage", "rosters.manage", "roster.edit"], {
    code: "SHIFT_TEMPLATE_PERMISSION_DENIED",
    message: "You do not have permission to manage shift templates.",
  }),
  requireReason(),
  controller.disableShiftTemplate,
);
shiftTemplatesRoutes.post(
  "/:id/enable",
  requireAnyPermissionOrError(["shift_templates.manage", "rosters.manage", "roster.edit"], {
    code: "SHIFT_TEMPLATE_PERMISSION_DENIED",
    message: "You do not have permission to manage shift templates.",
  }),
  requireReason(),
  controller.enableShiftTemplate,
);

export { shiftTemplatesRoutes };
