import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/rosters/rosters.controller";
import type { AppContext } from "../types/api.types";

const rostersRoutes = new Hono<AppContext>();

rostersRoutes.use("*", authMiddleware);
rostersRoutes.use("*", requireFeature("roster"));

rostersRoutes.get(
  "/",
  requireAnyPermissionOrError(["rosters.view", "roster.view"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to view rosters.",
  }),
  controller.listRosters,
);
rostersRoutes.post(
  "/",
  requireAnyPermissionOrError(["rosters.manage", "roster.create", "roster.edit"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to manage rosters.",
  }),
  controller.createRoster,
);
rostersRoutes.post(
  "/bulk",
  requireAnyPermissionOrError(["rosters.manage", "roster.create", "roster.edit"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to manage rosters.",
  }),
  controller.bulkCreateRoster,
);
rostersRoutes.post(
  "/publish",
  requireAnyPermissionOrError(["rosters.publish", "roster.publish"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to publish rosters.",
  }),
  requireReason(),
  controller.publishRoster,
);
rostersRoutes.post(
  "/conflicts/:id/resolve",
  requireAnyPermissionOrError(["roster.resolve_conflicts", "rosters.resolve_conflicts", "rosters.manage"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to resolve roster conflicts.",
  }),
  requireReason(),
  controller.resolveConflict,
);
rostersRoutes.post(
  "/conflicts/:id/override",
  requireAnyPermissionOrError(["roster.resolve_conflicts", "rosters.resolve_conflicts", "rosters.manage"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to resolve roster conflicts.",
  }),
  requireReason(),
  controller.overrideConflict,
);
rostersRoutes.get(
  "/conflicts",
  requireAnyPermissionOrError(["rosters.view", "roster.view", "roster.view_conflicts"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to view roster conflicts.",
  }),
  controller.listConflicts,
);
rostersRoutes.get("/calendar", controller.listRosters);
rostersRoutes.get("/week", controller.listRosters);
rostersRoutes.get("/month", controller.listRosters);
rostersRoutes.get("/:id", controller.getRoster);
rostersRoutes.patch(
  "/:id",
  requireAnyPermissionOrError(["rosters.manage", "roster.edit"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to manage rosters.",
  }),
  controller.updateRoster,
);
rostersRoutes.post(
  "/:id/cancel",
  requireAnyPermissionOrError(["rosters.manage", "roster.delete", "roster.edit"], {
    code: "ROSTER_PERMISSION_DENIED",
    message: "You do not have permission to cancel roster shifts.",
  }),
  requireReason(),
  controller.cancelRoster,
);

export { rostersRoutes };
