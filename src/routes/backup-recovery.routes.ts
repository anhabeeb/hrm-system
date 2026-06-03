import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/backup-recovery/backup-recovery.controller";
import type { AppContext } from "../types/api.types";

const backupRecoveryRoutes = new Hono<AppContext>();

backupRecoveryRoutes.use("*", authMiddleware);
backupRecoveryRoutes.use("*", requireFeature("backup_recovery"));

backupRecoveryRoutes.get("/status", requirePermission("backup.view"), controller.status);
backupRecoveryRoutes.get("/retention-policy", requirePermission("backup.manage_settings"), controller.getRetentionPolicy);
backupRecoveryRoutes.patch("/retention-policy", requirePermission("backup.manage_settings"), requireReason(), controller.updateRetentionPolicy);

backupRecoveryRoutes.get("/restore/requests", requirePermission("backup.restore_request"), controller.listRestoreRequests);
backupRecoveryRoutes.get("/restore/requests/:id", requirePermission("backup.restore_request"), controller.getRestoreRequest);
backupRecoveryRoutes.post("/restore/request", requirePermission("backup.restore_request"), requireReason(), controller.createRestoreRequest);
backupRecoveryRoutes.post("/restore/requests/:id/approve", requirePermission("backup.restore_approve"), requireReason(), controller.approveRestoreRequest);
backupRecoveryRoutes.post("/restore/requests/:id/reject", requirePermission("backup.restore_approve"), requireReason(), controller.rejectRestoreRequest);

backupRecoveryRoutes.get("/backups", requirePermission("backup.view_history"), controller.listBackups);
backupRecoveryRoutes.post("/backups", requirePermission("backup.create"), requireReason(), controller.createBackup);
backupRecoveryRoutes.post("/backups/create", requirePermission("backup.create"), requireReason(), controller.createBackup);
backupRecoveryRoutes.get("/backups/:id/download", requirePermission("backup.download"), controller.downloadBackup);
backupRecoveryRoutes.post("/backups/:id/verify", requirePermission("backup.view"), requireReason(), controller.verifyBackup);
backupRecoveryRoutes.post("/backups/:id/delete", requirePermission("backup.manage_settings"), requireReason(), controller.deleteBackup);
backupRecoveryRoutes.get("/backups/:id", requirePermission("backup.view"), controller.getBackup);

export { backupRecoveryRoutes };
