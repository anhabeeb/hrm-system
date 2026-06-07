import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/approvals/approvals.controller";
import type { AppContext } from "../types/api.types";

const approvalsRoutes = new Hono<AppContext>();

approvalsRoutes.use("*", authMiddleware);
approvalsRoutes.use("*", requireFeature("approvals"));

approvalsRoutes.get("/settings-summary", requireAnyPermission(["approvals.view", "approval_workflows.view", "approval_thresholds.view"]), controller.getSettingsSummary);
approvalsRoutes.get("/my-pending-count", requirePermission("approvals.view"), controller.getMyPendingCount);

approvalsRoutes.get("/workflows", requirePermission("approval_workflows.view"), controller.listWorkflows);
approvalsRoutes.post("/workflows", requirePermission("approval_workflows.manage"), requireReason(), controller.createWorkflow);
approvalsRoutes.get("/workflows/:workflowId", requirePermission("approval_workflows.view"), controller.getWorkflow);
approvalsRoutes.patch("/workflows/:workflowId", requirePermission("approval_workflows.manage"), controller.updateWorkflow);
approvalsRoutes.post("/workflows/:workflowId/enable", requirePermission("approval_workflows.manage"), requireReason(), controller.enableWorkflow);
approvalsRoutes.post("/workflows/:workflowId/disable", requirePermission("approval_workflows.manage"), requireReason(), controller.disableWorkflow);
approvalsRoutes.get("/workflows/:workflowId/steps", requirePermission("approval_workflows.view"), controller.listWorkflowSteps);
approvalsRoutes.post("/workflows/:workflowId/steps", requirePermission("approval_workflows.manage"), requireReason(), controller.createWorkflowStep);
approvalsRoutes.patch("/workflows/:workflowId/steps/:stepId", requirePermission("approval_workflows.manage"), requireReason(), controller.updateWorkflowStep);
approvalsRoutes.delete("/workflows/:workflowId/steps/:stepId", requirePermission("approval_workflows.manage"), requireReason(), controller.deleteWorkflowStep);

approvalsRoutes.get("/thresholds", requirePermission("approval_thresholds.view"), controller.listThresholds);
approvalsRoutes.post("/thresholds", requirePermission("approval_thresholds.edit"), requireReason(), controller.createThreshold);
approvalsRoutes.get("/thresholds/:thresholdId", requirePermission("approval_thresholds.view"), controller.getThreshold);
approvalsRoutes.patch("/thresholds/:thresholdId", requirePermission("approval_thresholds.edit"), requireReason(), controller.updateThreshold);
approvalsRoutes.post("/thresholds/:thresholdId/enable", requirePermission("approval_thresholds.edit"), requireReason(), controller.enableThreshold);
approvalsRoutes.post("/thresholds/:thresholdId/disable", requirePermission("approval_thresholds.edit"), requireReason(), controller.disableThreshold);
approvalsRoutes.get("/thresholds/:thresholdId/history", requirePermission("approval_thresholds.view"), controller.getThresholdHistory);

approvalsRoutes.get("/", requirePermission("approvals.view"), controller.listApprovals);
approvalsRoutes.get("/:id/history", requirePermission("approvals.view_history"), controller.getHistory);
approvalsRoutes.post("/:id/approve", requirePermission("approvals.approve"), controller.approveApproval);
approvalsRoutes.post("/:id/reject", requirePermission("approvals.reject"), controller.rejectApproval);
approvalsRoutes.post("/:id/return", requirePermission("approvals.return"), requireReason(), controller.returnApproval);
approvalsRoutes.post("/:id/cancel", requireReason(), controller.cancelApproval);
approvalsRoutes.post("/:id/retry", requirePermission("approvals.approve"), requireReason(), controller.retryApproval);
approvalsRoutes.post("/:id/override", requirePermission("approvals.override"), requireReason(), controller.overrideApproval);
approvalsRoutes.get("/:id", requirePermission("approvals.view"), controller.getApproval);

export { approvalsRoutes };
