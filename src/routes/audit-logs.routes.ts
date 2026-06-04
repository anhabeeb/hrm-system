import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/audit-logs/audit-logs.controller";
import type { AppContext } from "../types/api.types";

const auditLogsRoutes = new Hono<AppContext>();

auditLogsRoutes.use("*", authMiddleware);
auditLogsRoutes.use("*", requireFeature("audit_logs"));

auditLogsRoutes.get("/", requirePermission("audit_logs.view"), controller.listAuditLogs);
auditLogsRoutes.get("/:id", requirePermission("audit_logs.view"), controller.getAuditLog);

export { auditLogsRoutes };
