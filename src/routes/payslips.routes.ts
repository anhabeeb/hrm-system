import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/payslips/payslips.controller";
import type { AppContext } from "../types/api.types";

const payslipsRoutes = new Hono<AppContext>();

payslipsRoutes.use("*", authMiddleware);
payslipsRoutes.use("*", requireFeature("payslips"));

payslipsRoutes.post("/generate-batch", requirePermission("payslips.generate"), requireReason(), controller.generateBatch);
payslipsRoutes.get("/", requirePermission("payslips.view"), controller.listPayslips);
payslipsRoutes.get("/:id", requirePermission("payslips.view"), controller.getPayslip);
payslipsRoutes.get("/:id/download-placeholder", requirePermission("payslips.download"), controller.downloadPlaceholder);

export { payslipsRoutes };
