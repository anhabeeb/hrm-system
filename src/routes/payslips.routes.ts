import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature, requirePayrollSubFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/payslips/payslips.controller";
import type { AppContext } from "../types/api.types";

const payslipsRoutes = new Hono<AppContext>();

payslipsRoutes.use("*", authMiddleware);
payslipsRoutes.use("*", requireFeature("payroll"));
payslipsRoutes.use("*", requireFeature("payslips"));
payslipsRoutes.use("*", requirePayrollSubFeature("payroll.payslips_enabled"));

payslipsRoutes.post("/generate-batch", requirePermission("payslips.generate"), requireReason(), controller.generateBatch);
payslipsRoutes.get("/", requirePermission("payslips.view"), controller.listPayslips);
payslipsRoutes.get("/:id/download", requirePermission("payslips.download"), controller.downloadPayslip);
payslipsRoutes.get("/:id/download-placeholder", requirePermission("payslips.download"), controller.downloadPlaceholder);
payslipsRoutes.get("/:id/print", requirePermission("payslips.print"), controller.printPayslip);
payslipsRoutes.get("/:id", requirePermission("payslips.view"), controller.getPayslip);

export { payslipsRoutes };
