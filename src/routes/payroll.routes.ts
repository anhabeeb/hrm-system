import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/payroll/payroll.controller";
import type { AppContext } from "../types/api.types";

const payrollRoutes = new Hono<AppContext>();

payrollRoutes.use("*", authMiddleware);
payrollRoutes.use("*", requireFeature("payroll"));

payrollRoutes.get("/", requirePermission("payroll.view"), controller.listPayroll);
payrollRoutes.get("/month/:payrollMonth", requirePermission("payroll.view"), controller.getPayrollByMonth);
payrollRoutes.post("/calculate", requirePermission("payroll.calculate"), controller.calculate);
payrollRoutes.get("/:id", requirePermission("payroll.view"), controller.getPayroll);
payrollRoutes.post("/:id/recalculate", requirePermission("payroll.recalculate"), requireReason(), controller.recalculate);
payrollRoutes.get("/:id/items", requirePermission("payroll.view"), controller.listItems);
payrollRoutes.get("/:id/items/:itemId", requirePermission("payroll.view"), controller.getItem);
payrollRoutes.get("/:id/exceptions", requirePermission("payroll.view_exceptions"), controller.listExceptions);
payrollRoutes.post("/:id/exceptions/:exceptionId/resolve", requirePermission("payroll.resolve_exceptions"), requireReason({ fields: ["reason", "resolution_notes"] }), controller.resolveException);
payrollRoutes.post("/:id/submit-approval", requirePermission("payroll.review"), requireReason(), controller.submitApproval);
payrollRoutes.post("/:id/approve", requirePermission("payroll.approve"), requireReason(), controller.approve);
payrollRoutes.post("/:id/reject", requirePermission("payroll.reject"), requireReason(), controller.reject);
payrollRoutes.post("/:id/lock", requirePermission("payroll.lock"), requireReason(), controller.lock);
payrollRoutes.post("/:id/request-reopen", requirePermission("payroll.request_reopen"), requireReason(), controller.requestReopen);
payrollRoutes.post("/:id/approve-reopen", requirePermission("payroll.approve_reopen"), requireReason(), controller.approveReopen);
payrollRoutes.post("/:id/reopen", requirePermission("payroll.reopen"), requireReason(), controller.reopen);
payrollRoutes.get("/:id/export", requirePermission("payroll.export"), controller.exportPayroll);

export { payrollRoutes };
