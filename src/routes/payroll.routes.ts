import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/payroll/payroll.controller";
import * as payslipsController from "../modules/payslips/payslips.controller";
import type { AppContext } from "../types/api.types";

const payrollRoutes = new Hono<AppContext>();

payrollRoutes.use("*", authMiddleware);
payrollRoutes.use("*", requireFeature("payroll"));

payrollRoutes.get("/", requirePermission("payroll.view"), controller.listPayroll);
payrollRoutes.get("/month/:payrollMonth", requirePermission("payroll.view"), controller.getPayrollByMonth);
payrollRoutes.post("/calculate", requirePermission("payroll.calculate"), controller.calculate);
payrollRoutes.get("/adjustments", requireAnyPermission(["payroll.adjustments.view", "payroll.adjustments.create", "payroll.adjustments.cancel", "payroll.adjustments.review", "payroll.adjustments.approve", "payroll.adjustments.finalApprove", "payroll.adjustments.reject", "payroll.adjustments.apply", "payroll.adjustments.audit.view", "approvals.department.view", "approvals.financeFinal.view", "approvals.requests.view"]), controller.listAdjustments);
payrollRoutes.post("/adjustments", requireAnyPermission(["payroll.adjustments.create", "payroll.adjustments.createForOthers"]), controller.createAdjustment);
payrollRoutes.get("/adjustments/:id", requireAnyPermission(["payroll.adjustments.view", "payroll.adjustments.review", "payroll.adjustments.approve", "payroll.adjustments.finalApprove", "payroll.adjustments.reject", "payroll.adjustments.apply", "payroll.adjustments.audit.view", "approvals.department.view", "approvals.financeFinal.view", "approvals.requests.view"]), controller.getAdjustment);
payrollRoutes.post("/adjustments/:id/submit", requireAnyPermission(["payroll.adjustments.submit", "payroll.adjustments.create", "payroll.adjustments.createForOthers"]), controller.submitAdjustment);
payrollRoutes.post("/adjustments/:id/approve", requireAnyPermission(["payroll.adjustments.approve", "payroll.adjustments.review", "payroll.adjustments.finalApprove", "approvals.department.approve", "approvals.financeFinal.approve"]), requireReason(), controller.approveAdjustment);
payrollRoutes.post("/adjustments/:id/reject", requireAnyPermission(["payroll.adjustments.reject", "approvals.department.reject", "approvals.financeFinal.reject"]), requireReason(), controller.rejectAdjustment);
payrollRoutes.post("/adjustments/:id/cancel", requireAnyPermission(["payroll.adjustments.cancel", "payroll.adjustments.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]), requireReason(), controller.cancelAdjustment);
payrollRoutes.post("/adjustments/:id/apply", requireAnyPermission(["payroll.adjustments.apply"]), requireReason(), controller.applyAdjustment);
payrollRoutes.get("/adjustments/:id/approval-timeline", requireAnyPermission(["payroll.adjustments.audit.view", "payroll.adjustments.view", "payroll.adjustments.review", "payroll.adjustments.approve", "payroll.adjustments.finalApprove", "payroll.adjustments.reject", "payroll.adjustments.apply", "approvals.requests.audit.view", "approvals.department.view", "approvals.financeFinal.view"]), controller.adjustmentTimeline);
payrollRoutes.post("/runs/:id/submit-approval", requirePermission("payroll.review"), requireReason(), controller.submitApproval);
payrollRoutes.post("/runs/:id/approve", requirePermission("payroll.approve"), requireReason(), controller.approve);
payrollRoutes.post("/runs/:id/reject", requirePermission("payroll.reject"), requireReason(), controller.reject);
payrollRoutes.post("/runs/:id/finalize", requirePermission("payroll.finalize"), requireReason(), controller.finalize);
payrollRoutes.get("/runs/:id/payslips", requireFeature("payslips"), requirePermission("payslips.view"), payslipsController.listRunPayslips);
payrollRoutes.get("/runs/:id/payslips/:payslipId", requireFeature("payslips"), requirePermission("payslips.view"), payslipsController.getRunPayslip);
payrollRoutes.get("/:id", requirePermission("payroll.view"), controller.getPayroll);
payrollRoutes.post("/:id/recalculate", requirePermission("payroll.recalculate"), requireReason(), controller.recalculate);
payrollRoutes.get("/:id/calculation-preview", requirePermission("payroll.view"), controller.previewCalculation);
payrollRoutes.get("/:id/items", requirePermission("payroll.view"), controller.listItems);
payrollRoutes.get("/:id/items/:itemId", requirePermission("payroll.view"), controller.getItem);
payrollRoutes.get("/:id/exceptions", requirePermission("payroll.view_exceptions"), controller.listExceptions);
payrollRoutes.post("/:id/exceptions/:exceptionId/resolve", requirePermission("payroll.resolve_exceptions"), requireReason({ fields: ["reason", "resolution_notes"] }), controller.resolveException);
payrollRoutes.post("/:id/submit-approval", requirePermission("payroll.review"), requireReason(), controller.submitApproval);
payrollRoutes.post("/:id/approve", requirePermission("payroll.approve"), requireReason(), controller.approve);
payrollRoutes.post("/:id/reject", requirePermission("payroll.reject"), requireReason(), controller.reject);
payrollRoutes.post("/:id/finalize", requirePermission("payroll.finalize"), requireReason(), controller.finalize);
payrollRoutes.post("/:id/lock", requirePermission("payroll.lock"), requireReason(), controller.lock);
payrollRoutes.post("/:id/request-reopen", requirePermission("payroll.request_reopen"), requireReason(), controller.requestReopen);
payrollRoutes.post("/:id/approve-reopen", requirePermission("payroll.approve_reopen"), requireReason(), controller.approveReopen);
payrollRoutes.post("/:id/reopen", requirePermission("payroll.reopen"), requireReason(), controller.reopen);
payrollRoutes.get("/:id/export", requirePermission("payroll.export"), controller.exportPayroll);

export { payrollRoutes };
