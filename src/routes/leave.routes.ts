import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/leave/leave.controller";
import type { AppContext } from "../types/api.types";

const leaveRoutes = new Hono<AppContext>();

leaveRoutes.use("*", authMiddleware);
leaveRoutes.use("*", requireFeature("leave_management"));

leaveRoutes.get("/types", requireAnyPermission(["leave.view", "leave_settings.view"]), controller.listTypes);
leaveRoutes.patch("/types/:id", requireAnyPermission(["leave_settings.manage", "leave_types.enable_disable"]), requireReason(), controller.updateType);

leaveRoutes.get("/policies", requireAnyPermission(["leave.view", "leave_settings.view"]), controller.listPolicies);
leaveRoutes.post("/policies", requireAnyPermission(["leave_settings.manage", "leave_policy_limits.edit"]), requireReason(), controller.createPolicy);
leaveRoutes.patch("/policies/:id", requireAnyPermission(["leave_settings.manage", "leave_policy_limits.edit"]), requireReason(), controller.updatePolicy);

leaveRoutes.get("/balances", requireAnyPermission(["leave.balances.view", "leave.view", "leave.manage_balances"]), controller.listBalances);
leaveRoutes.post("/balances/opening", requireAnyPermission(["leave.balances.manage", "leave.balances.adjust", "leave.manage_balances"]), requireReason(), controller.setOpeningBalance);
leaveRoutes.post("/balances/adjust", requireAnyPermission(["leave.balances.adjust", "leave.manage_balances", "leave_policy_override.manage"]), requireReason(), controller.adjustBalanceFromBody);
leaveRoutes.post("/balances/carry-forward", requireAnyPermission(["leave.balances.manage", "leave.balances.adjust", "leave.manage_balances"]), requireReason(), controller.applyCarryForward);
leaveRoutes.post("/balances/expire", requireAnyPermission(["leave.balances.manage", "leave.balances.adjust", "leave.manage_balances"]), requireReason(), controller.applyExpiry);
leaveRoutes.get("/balances/:employeeId/transactions", requireAnyPermission(["leave.transactions.view", "leave.balances.view", "leave.view"]), controller.listBalanceTransactions);
leaveRoutes.post("/balances/:employeeId/rebuild", requireAnyPermission(["leave.balances.manage", "leave.manage_balances"]), requireReason(), controller.rebuildBalances);
leaveRoutes.get("/balances/:employeeId", requireAnyPermission(["leave.balances.view", "leave.view"]), controller.getEmployeeBalances);
leaveRoutes.post("/balances/:employeeId/adjust", requireAnyPermission(["leave.balances.adjust", "leave.manage_balances", "leave_policy_override.manage"]), requireReason(), controller.adjustBalance);

leaveRoutes.post("/accrual/preview", requireAnyPermission(["leave.accrual.preview", "leave.balances.view", "leave.view"]), controller.previewAccrual);
leaveRoutes.post("/accrual/apply", requireAnyPermission(["leave.accrual.apply", "leave.balances.manage", "leave.manage_balances"]), requireReason(), controller.applyAccrual);

leaveRoutes.get("/approvals/inbox", requireAnyPermission(["leave.approvals.view", "leave.approvals.approve", "leave.approve", "approvals.department.view", "approvals.department.approve", "approvals.hrFinal.view", "approvals.hrFinal.approve", "approvals.financeFinal.view", "approvals.financeFinal.approve"]), controller.listApprovalInbox);
leaveRoutes.get("/approvals/history", requireAnyPermission(["leave.approvals.view", "leave.timeline.view", "leave.view", "approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view"]), controller.listApprovalHistory);
leaveRoutes.get("/approvals/:requestId", requireAnyPermission(["leave.approvals.view", "leave.timeline.view", "leave.view", "approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view"]), controller.getApprovalDetail);

leaveRoutes.get("/requests", requireAnyPermission(["leave.view", "leave.approvals.view", "approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]), controller.listRequests);
leaveRoutes.get("/requests/:requestId/timeline", requireAnyPermission(["leave.timeline.view", "leave.approvals.view", "leave.view", "approvals.requests.view", "approvals.requests.audit.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]), controller.getTimeline);
leaveRoutes.get("/requests/:id", requireAnyPermission(["leave.view", "leave.approvals.view", "approvals.requests.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.financeFinal.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]), controller.getRequest);
leaveRoutes.post("/requests", requireAnyPermission(["leave.create", "leave.requests.create_for_employee", "approvals.requests.create", "approvals.requests.createForOthers"]), controller.createRequest);
leaveRoutes.post("/requests/:id/submit", requireAnyPermission(["leave.requests.submit", "leave.create", "approvals.requests.create", "approvals.requests.createForOthers"]), requireReason(), controller.submitRequest);
leaveRoutes.patch("/requests/:id", requirePermission("leave.edit"), controller.updateRequest);
leaveRoutes.post("/requests/:id/approve", requireAnyPermission(["leave.approvals.approve", "leave.approve", "leave.requests.override", "approvals.requests.approve", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]), requireReason(), controller.approveRequest);
leaveRoutes.post("/requests/:id/reject", requireAnyPermission(["leave.approvals.reject", "leave.reject", "approvals.requests.reject", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]), requireReason(), controller.rejectRequest);
leaveRoutes.post("/requests/:id/cancel", requireAnyPermission(["leave.requests.cancel", "leave.cancel", "leave.edit", "leave.requests.override", "approvals.requests.cancel", "approvals.requests.cancelAny"]), requireReason(), controller.cancelRequest);
leaveRoutes.post("/requests/:id/withdraw", requireAnyPermission(["leave.requests.withdraw", "leave.cancel", "leave.edit", "approvals.requests.cancel"]), requireReason(), controller.withdrawRequest);
leaveRoutes.post("/requests/:id/delegate", requireAnyPermission(["leave.approvals.delegate", "leave.approvals.override"]), requireReason(), controller.delegateRequest);
leaveRoutes.post("/requests/:id/escalate", requireAnyPermission(["leave.approvals.escalate", "leave.approvals.override"]), requireReason(), controller.escalateRequest);

leaveRoutes.get("/calendar", requirePermission("leave.view"), controller.calendar);

export { leaveRoutes };
