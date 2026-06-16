import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as weeklyMatrixController from "../modules/rosters/roster-weekly-matrix.controller";
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
const rosterMatrixViewPermissions = ["rosters.weeklyMatrix.view", "rosters.weeklyMatrix.viewTeam", "rosters.weeklyMatrix.viewAll", "rosters.view", "roster.view"];
const rosterMatrixEditPermissions = ["rosters.weeklyMatrix.edit", "rosters.manage", "roster.create", "roster.edit"];
const rosterMatrixSubmitPermissions = ["rosters.weeklyMatrix.submit", "roster.changes.create", "roster.changes.createForOthers"];
const rosterMatrixApplyPermissions = ["rosters.weeklyMatrix.apply", "rosters.manage", "roster.publish", "roster.changes.apply"];
rostersRoutes.get(
  "/weekly-matrix",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixViewPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to view the roster weekly matrix.",
  }),
  weeklyMatrixController.getWeeklyMatrix,
);
rostersRoutes.get(
  "/weekly-matrix/employees",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixViewPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to search roster matrix employees.",
  }),
  weeklyMatrixController.listMatrixEmployees,
);
rostersRoutes.get(
  "/weekly-matrix/shifts",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixViewPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to view roster matrix shifts.",
  }),
  weeklyMatrixController.listMatrixShifts,
);
rostersRoutes.post(
  "/weekly-matrix/validate",
  requireFeature("employee_management"),
  requireAnyPermissionOrError([...rosterMatrixViewPermissions, ...rosterMatrixEditPermissions], {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to validate roster matrix changes.",
  }),
  weeklyMatrixController.validateMatrixChanges,
);
rostersRoutes.post(
  "/weekly-matrix/save-draft",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixEditPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to save roster matrix drafts.",
  }),
  weeklyMatrixController.saveMatrixDraft,
);
rostersRoutes.post(
  "/weekly-matrix/submit",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixSubmitPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to submit roster matrix changes.",
  }),
  requireReason(),
  weeklyMatrixController.submitMatrixChanges,
);
rostersRoutes.post(
  "/weekly-matrix/apply",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(rosterMatrixApplyPermissions, {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to apply roster matrix changes.",
  }),
  requireReason(),
  weeklyMatrixController.applyMatrixChanges,
);
rostersRoutes.post(
  "/weekly-matrix/copy-previous-week",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(["rosters.weeklyMatrix.copyWeek", ...rosterMatrixEditPermissions], {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to copy roster weeks.",
  }),
  weeklyMatrixController.copyPreviousWeek,
);
rostersRoutes.post(
  "/weekly-matrix/bulk-assign",
  requireFeature("employee_management"),
  requireAnyPermissionOrError(["rosters.weeklyMatrix.bulkAssign", ...rosterMatrixEditPermissions], {
    code: "ROSTER_MATRIX_PERMISSION_DENIED",
    message: "You do not have permission to bulk assign roster shifts.",
  }),
  weeklyMatrixController.bulkAssign,
);
rostersRoutes.get(
  "/changes",
  requireAnyPermissionOrError(["roster.changes.view", "roster.changes.audit.view", "roster.changes.create", "roster.changes.cancel", "approvals.department.view", "approvals.hrFinal.view", "approvals.requests.view"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to view roster change requests.",
  }),
  controller.listRosterChanges,
);
rostersRoutes.post(
  "/changes",
  requireAnyPermissionOrError(["roster.changes.create", "roster.changes.createForOthers"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to create roster change requests.",
  }),
  controller.createRosterChange,
);
rostersRoutes.get(
  "/changes/:id/approval-timeline",
  requireAnyPermissionOrError(["roster.changes.view", "roster.changes.audit.view", "roster.changes.create", "roster.changes.cancel", "approvals.department.view", "approvals.hrFinal.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.requests.audit.view"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to view this roster change timeline.",
  }),
  controller.getRosterChangeTimeline,
);
rostersRoutes.post(
  "/changes/:id/submit",
  requireAnyPermissionOrError(["roster.changes.create", "roster.changes.createForOthers"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to submit roster change requests.",
  }),
  controller.submitRosterChange,
);
rostersRoutes.post(
  "/changes/:id/cancel",
  requireAnyPermissionOrError(["roster.changes.cancel", "roster.changes.cancelAny"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to cancel roster change requests.",
  }),
  requireReason(),
  controller.cancelRosterChange,
);
rostersRoutes.post(
  "/changes/:id/approve",
  requireAnyPermissionOrError(["roster.changes.approve", "approvals.department.approve", "approvals.hrFinal.approve"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to approve roster change requests.",
  }),
  controller.approveRosterChange,
);
rostersRoutes.post(
  "/changes/:id/reject",
  requireAnyPermissionOrError(["roster.changes.reject", "approvals.department.reject", "approvals.hrFinal.reject"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to reject roster change requests.",
  }),
  requireReason(),
  controller.rejectRosterChange,
);
rostersRoutes.get(
  "/changes/:id",
  requireAnyPermissionOrError(["roster.changes.view", "roster.changes.audit.view", "roster.changes.create", "roster.changes.cancel", "approvals.department.view", "approvals.hrFinal.view", "approvals.requests.view"], {
    code: "ROSTER_CHANGE_PERMISSION_DENIED",
    message: "You do not have permission to view roster change requests.",
  }),
  controller.getRosterChange,
);
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
