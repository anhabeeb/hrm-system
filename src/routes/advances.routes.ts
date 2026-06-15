import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/advances/advances.controller";
import type { AppContext } from "../types/api.types";

const advancesRoutes = new Hono<AppContext>();

advancesRoutes.use("*", authMiddleware);
advancesRoutes.use("*", requireFeature("advance_salary"));

advancesRoutes.get("/salary-requests", requireAnyPermission(["advanceSalary.requests.view", "advanceSalary.requests.create", "advanceSalary.requests.cancel", "advanceSalary.requests.review", "advanceSalary.requests.approve", "advanceSalary.requests.finalApprove", "advanceSalary.requests.reject", "advanceSalary.payments.execute", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "advanceSalary.audit.view", "approvals.requests.view"]), controller.listSalaryRequests);
advancesRoutes.post("/salary-requests", requireAnyPermission(["advanceSalary.requests.create", "advanceSalary.requests.createForOthers"]), requireReason(), controller.createSalaryRequest);
advancesRoutes.get("/salary-requests/:id", requireAnyPermission(["advanceSalary.requests.view", "advanceSalary.requests.review", "advanceSalary.requests.approve", "advanceSalary.requests.finalApprove", "advanceSalary.requests.reject", "advanceSalary.payments.execute", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "advanceSalary.audit.view", "approvals.requests.view"]), controller.getSalaryRequest);
advancesRoutes.post("/salary-requests/:id/submit", requireAnyPermission(["advanceSalary.requests.submit", "advanceSalary.requests.create", "advanceSalary.requests.createForOthers"]), controller.submitSalaryRequest);
advancesRoutes.post("/salary-requests/:id/approve", requireAnyPermission(["advanceSalary.requests.approve", "advanceSalary.requests.review", "advanceSalary.requests.finalApprove", "approvals.department.approve"]), requireReason(), controller.approveSalaryRequest);
advancesRoutes.post("/salary-requests/:id/reject", requireAnyPermission(["advanceSalary.requests.reject", "approvals.department.reject"]), requireReason(), controller.rejectSalaryRequest);
advancesRoutes.post("/salary-requests/:id/cancel", requireAnyPermission(["advanceSalary.requests.cancel", "advanceSalary.requests.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]), requireReason(), controller.cancelSalaryRequest);
advancesRoutes.post("/salary-requests/:id/execute-payment", requireAnyPermission(["advanceSalary.payments.execute", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"]), requireReason(), controller.executeSalaryPayment);
advancesRoutes.get("/salary-requests/:id/deductions", requireAnyPermission(["advanceSalary.audit.view", "advanceSalary.requests.view", "advanceSalary.payments.execute", "approvals.operationExecutor.view", "approvals.operationExecutor.apply"]), controller.salaryRequestDeductions);
advancesRoutes.get("/salary-requests/:id/approval-timeline", requireAnyPermission(["advanceSalary.audit.view", "advanceSalary.requests.view", "advanceSalary.requests.review", "advanceSalary.requests.approve", "advanceSalary.requests.finalApprove", "advanceSalary.payments.execute", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "approvals.requests.audit.view"]), controller.salaryRequestTimeline);

advancesRoutes.get("/", requirePermission("advances.view"), controller.listAdvances);
advancesRoutes.get("/:id", requirePermission("advances.view"), controller.getAdvance);
advancesRoutes.post("/", requirePermission("advances.create"), requireReason(), controller.createAdvance);
advancesRoutes.patch("/:id", requirePermission("advances.edit"), requireReason(), controller.updateAdvance);
advancesRoutes.post("/:id/approve", requirePermission("advances.approve"), requireReason(), controller.approveAdvance);
advancesRoutes.post("/:id/reject", requirePermission("advances.reject"), requireReason(), controller.rejectAdvance);

export { advancesRoutes };
