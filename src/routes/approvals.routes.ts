import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as engineController from "../modules/approvals/approval-workflow-engine.controller";
import * as controller from "../modules/approvals/approvals.controller";
import type { AppContext } from "../types/api.types";

const approvalsRoutes = new Hono<AppContext>();

approvalsRoutes.use("*", authMiddleware);
approvalsRoutes.use("*", requireFeature("approvals"));

approvalsRoutes.get("/settings-summary", requireAnyPermission(["approvals.view", "approval_workflows.view", "approval_thresholds.view"]), controller.getSettingsSummary);
approvalsRoutes.get("/my-pending-count", requirePermission("approvals.view"), controller.getMyPendingCount);

approvalsRoutes.get("/workflows", requireAnyPermission(["approvals.workflows.view", "approval_workflows.view", "leave.approvals.settings.manage"]), engineController.listWorkflows);
approvalsRoutes.post("/workflows", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.createWorkflow);
approvalsRoutes.post("/workflows/default-template", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage"]), engineController.seedDefaultWorkflowTemplate);
approvalsRoutes.get("/workflows/:workflowId", requireAnyPermission(["approvals.workflows.view", "approval_workflows.view", "leave.approvals.settings.manage"]), engineController.getWorkflow);
approvalsRoutes.patch("/workflows/:workflowId", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.updateWorkflow);
approvalsRoutes.post("/workflows/:workflowId/activate", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.activateWorkflow);
approvalsRoutes.post("/workflows/:workflowId/deactivate", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.deactivateWorkflow);
approvalsRoutes.post("/workflows/:workflowId/archive", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.archiveWorkflow);
approvalsRoutes.post("/workflows/:workflowId/enable", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.activateWorkflow);
approvalsRoutes.post("/workflows/:workflowId/disable", requireAnyPermission(["approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.deactivateWorkflow);
approvalsRoutes.get("/workflows/:workflowId/steps", requireAnyPermission(["approvals.workflowSteps.view", "approvals.workflows.view", "approval_workflows.view", "leave.approvals.settings.manage"]), engineController.listWorkflowSteps);
approvalsRoutes.post("/workflows/:workflowId/steps", requireAnyPermission(["approvals.workflowSteps.manage", "approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.createWorkflowStep);
approvalsRoutes.post("/workflows/:workflowId/steps/reorder", requireAnyPermission(["approvals.workflowSteps.manage", "approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.reorderWorkflowSteps);
approvalsRoutes.patch("/workflows/:workflowId/steps/:stepId", requireAnyPermission(["approvals.workflowSteps.manage", "approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.updateWorkflowStep);
approvalsRoutes.post("/workflows/:workflowId/steps/:stepId/disable", requireAnyPermission(["approvals.workflowSteps.manage", "approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.disableWorkflowStep);
approvalsRoutes.post("/workflows/:workflowId/steps/:stepId/enable", requireAnyPermission(["approvals.workflowSteps.manage", "approvals.workflows.manage", "approval_workflows.manage", "leave.approvals.settings.manage"]), engineController.enableWorkflowStep);
approvalsRoutes.delete("/workflows/:workflowId/steps/:stepId", requireAnyPermission(["approval_workflows.manage", "leave.approvals.settings.manage"]), requireReason(), controller.deleteWorkflowStep);

approvalsRoutes.get("/requests", requireAnyPermission(["approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view", "approvals.view"]), engineController.listRequests);
approvalsRoutes.post("/requests", requirePermission("approvals.requests.create"), engineController.createApprovalRequest);
approvalsRoutes.get("/requests/:id", requireAnyPermission(["approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view", "approvals.view"]), engineController.getApprovalRequest);
approvalsRoutes.post("/requests/:id/submit", requireAnyPermission(["approvals.requests.create", "approvals.requests.createForOthers"]), engineController.submitApprovalRequest);
approvalsRoutes.post("/requests/:id/cancel", requireAnyPermission(["approvals.requests.cancel", "approvals.requests.cancelAny"]), engineController.cancelApprovalRequest);
approvalsRoutes.post("/requests/:id/approve", requireAnyPermission(["approvals.requests.approve", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]), engineController.approveApprovalRequest);
approvalsRoutes.post("/requests/:id/reject", requireAnyPermission(["approvals.requests.reject", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]), engineController.rejectApprovalRequest);
approvalsRoutes.post("/requests/:id/escalate", requirePermission("approvals.requests.escalate"), engineController.escalateApprovalRequest);
approvalsRoutes.post("/requests/:id/steps/:stepId/assign", requirePermission("approvals.requests.assign"), engineController.assignApprovalRequestStep);
approvalsRoutes.get("/requests/:id/timeline", requireAnyPermission([
  "approvals.requests.view",
  "approvals.requests.audit.view",
  "approvals.department.view",
  "approvals.hrFinal.view",
  "approvals.financeFinal.view",
  "approvals.department.approve",
  "approvals.hrFinal.approve",
  "approvals.financeFinal.approve",
  "approvals.department.reject",
  "approvals.hrFinal.reject",
  "approvals.financeFinal.reject",
  "approvals.view",
]), engineController.getApprovalRequestTimeline);
approvalsRoutes.get("/my-pending", engineController.getMyPending);
approvalsRoutes.get("/my-requests", engineController.getMyRequests);

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
