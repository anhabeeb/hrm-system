import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/employee-discipline/employee-discipline.controller";
import type { AppContext } from "../types/api.types";

const employeeDisciplineRoutes = new Hono<AppContext>();

employeeDisciplineRoutes.use("*", authMiddleware);
employeeDisciplineRoutes.use("*", requireFeature("employee_management"));

const viewPermissions = [
  "employeeDiscipline.actions.view",
  "employeeDiscipline.actions.viewOwn",
  "employeeDiscipline.actions.create",
  "employeeDiscipline.actions.review",
  "employeeDiscipline.actions.investigate",
  "employeeDiscipline.actions.finalApprove",
  "employeeDiscipline.actions.apply",
  "employeeDiscipline.actions.manage",
  "employeeDiscipline.records.view",
  "employeeDiscipline.records.viewOwn",
  "employeeDiscipline.records.viewAll",
  "employeeDiscipline.tasks.view",
  "employeeDiscipline.tasks.complete",
  "employeeDiscipline.tasks.waive",
  "employeeDiscipline.audit.view",
  "approvals.department.view",
  "approvals.department.approve",
  "approvals.operationOwner.view",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.view",
  "approvals.operationFinal.approve",
  "approvals.operationExecutor.view",
  "approvals.operationExecutor.apply",
  "approvals.requests.audit.view",
];

employeeDisciplineRoutes.get("/actions", requireAnyPermission(viewPermissions), controller.listDisciplinaryActions);
employeeDisciplineRoutes.post("/actions", requireAnyPermission(["employeeDiscipline.actions.create", "employeeDiscipline.actions.createForOthers"]), controller.createDisciplinaryAction);
employeeDisciplineRoutes.get("/records", requireAnyPermission(["employeeDiscipline.records.view", "employeeDiscipline.records.viewOwn", "employeeDiscipline.records.viewAll", "employeeDiscipline.actions.manage", "employeeDiscipline.audit.view"]), controller.listDisciplinaryRecords);
employeeDisciplineRoutes.get("/records/:recordId", requireAnyPermission(["employeeDiscipline.records.view", "employeeDiscipline.records.viewOwn", "employeeDiscipline.records.viewAll", "employeeDiscipline.actions.manage", "employeeDiscipline.audit.view"]), controller.getDisciplinaryRecord);
employeeDisciplineRoutes.get("/actions/:requestId", requireAnyPermission(viewPermissions), controller.getDisciplinaryAction);
employeeDisciplineRoutes.post("/actions/:requestId/submit", requireAnyPermission(["employeeDiscipline.actions.create", "employeeDiscipline.actions.createForOthers"]), controller.submitDisciplinaryAction);
employeeDisciplineRoutes.post(
  "/actions/:requestId/approve",
  requireAnyPermission(["employeeDiscipline.actions.review", "employeeDiscipline.actions.investigate", "employeeDiscipline.actions.finalApprove", "approvals.department.approve", "approvals.operationOwner.approve", "approvals.operationFinal.approve"]),
  requireReason(),
  controller.approveDisciplinaryAction,
);
employeeDisciplineRoutes.post(
  "/actions/:requestId/reject",
  requireAnyPermission(["employeeDiscipline.actions.reject", "approvals.department.reject", "approvals.operationOwner.reject", "approvals.operationFinal.reject"]),
  requireReason(),
  controller.rejectDisciplinaryAction,
);
employeeDisciplineRoutes.post(
  "/actions/:requestId/cancel",
  requireAnyPermission(["employeeDiscipline.actions.cancel", "employeeDiscipline.actions.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]),
  requireReason(),
  controller.cancelDisciplinaryAction,
);
employeeDisciplineRoutes.post(
  "/actions/:requestId/apply",
  requireAnyPermission(["employeeDiscipline.actions.apply", "employeeDiscipline.actions.manage", "approvals.operationExecutor.apply"]),
  requireReason(),
  controller.applyDisciplinaryAction,
);
employeeDisciplineRoutes.post(
  "/actions/:requestId/acknowledge",
  requireAnyPermission(["employeeDiscipline.acknowledge", "employeeDiscipline.actions.manage"]),
  requireReason(),
  controller.acknowledgeDisciplinaryAction,
);
employeeDisciplineRoutes.post(
  "/actions/:requestId/close",
  requireAnyPermission(["employeeDiscipline.actions.close", "employeeDiscipline.actions.manage"]),
  requireReason(),
  controller.closeDisciplinaryAction,
);
employeeDisciplineRoutes.get("/actions/:requestId/timeline", requireAnyPermission(viewPermissions), controller.disciplinaryTimeline);
employeeDisciplineRoutes.get("/actions/:requestId/audit", requireAnyPermission([...viewPermissions, "employeeDiscipline.audit.view"]), controller.disciplinaryAudit);
employeeDisciplineRoutes.get("/actions/:requestId/items", requireAnyPermission(viewPermissions), controller.disciplinaryItems);
employeeDisciplineRoutes.get("/actions/:requestId/tasks", requireAnyPermission(viewPermissions), controller.disciplinaryTasks);
employeeDisciplineRoutes.post("/actions/:requestId/tasks/:taskId/complete", requireAnyPermission(["employeeDiscipline.tasks.complete", "employeeDiscipline.actions.manage"]), controller.completeDisciplinaryTask);
employeeDisciplineRoutes.post("/actions/:requestId/tasks/:taskId/waive", requireAnyPermission(["employeeDiscipline.tasks.waive", "employeeDiscipline.actions.manage"]), requireReason(), controller.waiveDisciplinaryTask);

export { employeeDisciplineRoutes };
