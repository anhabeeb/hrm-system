import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature, requirePayrollSubFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/salary-loans/salary-loans.controller";
import type { AppContext } from "../types/api.types";

const salaryLoansRoutes = new Hono<AppContext>();

salaryLoansRoutes.use("*", authMiddleware);
salaryLoansRoutes.use("*", requireFeature("payroll"));
salaryLoansRoutes.use("*", requirePayrollSubFeature("payroll.salary_loans_enabled"));

salaryLoansRoutes.get("/", requirePermission("salary_loans.view"), controller.listLoans);
salaryLoansRoutes.get("/:id", requirePermission("salary_loans.view"), controller.getLoan);
salaryLoansRoutes.post("/", requirePermission("salary_loans.create"), requireReason(), controller.createLoan);
salaryLoansRoutes.patch("/:id", requirePermission("salary_loans.edit"), requireReason(), controller.updateLoan);
salaryLoansRoutes.post("/:id/approve", requirePermission("salary_loans.approve"), requireReason(), controller.approveLoan);
salaryLoansRoutes.post("/:id/pause", requirePermission("salary_loans.pause"), requireReason(), controller.pauseLoan);
salaryLoansRoutes.post("/:id/settle", requirePermission("salary_loans.settle"), requireReason(), controller.settleLoan);
salaryLoansRoutes.get("/:id/installments", requirePermission("salary_loans.view"), controller.listInstallments);

export { salaryLoansRoutes };
