import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/backup-recovery/backup-recovery.controller";
import type { AppContext } from "../types/api.types";

const backupRecoveryRoutes = new Hono<AppContext>();

backupRecoveryRoutes.use("*", authMiddleware);
backupRecoveryRoutes.use("*", requireFeature("backup_recovery"));

backupRecoveryRoutes.get("/status", requireAnyPermission(["backup_recovery.view", "backup.view"]), controller.status);
backupRecoveryRoutes.get("/settings", requireAnyPermission(["backup_recovery.view", "backup.settings.view", "backup_settings.view"]), controller.getSettings);
backupRecoveryRoutes.patch("/settings", requireAnyPermission(["backup_recovery.settings.manage", "backup.manage_settings", "backup_settings.manage"]), requireReason(), controller.updateSettings);
backupRecoveryRoutes.get("/retention-policy", requireAnyPermission(["backup_recovery.settings.manage", "backup.manage_settings"]), controller.getRetentionPolicy);
backupRecoveryRoutes.patch("/retention-policy", requireAnyPermission(["backup_recovery.settings.manage", "backup.manage_settings"]), requireReason(), controller.updateRetentionPolicy);

backupRecoveryRoutes.get("/restores", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.listRestoreJobs);
backupRecoveryRoutes.post("/restores", requireAnyPermission(["backup_recovery.restore.create", "backup.restore_request"]), requireReason(), controller.createRestoreJob);
backupRecoveryRoutes.get("/restores/:id", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.getRestoreJob);
backupRecoveryRoutes.post("/restores/:id/validate", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.validateRestoreJob);
backupRecoveryRoutes.post("/restores/:id/preview", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.previewRestoreJob);
backupRecoveryRoutes.post("/restores/:id/apply", requireAnyPermission(["backup_recovery.restore.apply"]), requireReason(), controller.applyRestoreJob);
backupRecoveryRoutes.post("/restores/:id/cancel", requireAnyPermission(["backup_recovery.restore.cancel", "backup.restore_approve"]), requireReason(), controller.cancelRestoreJob);

backupRecoveryRoutes.get("/restore/requests", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.listRestoreRequests);
backupRecoveryRoutes.get("/restore/requests/:id", requireAnyPermission(["backup_recovery.restore.preview", "backup.restore_request"]), controller.getRestoreRequest);
backupRecoveryRoutes.post("/restore/request", requireAnyPermission(["backup_recovery.restore.create", "backup.restore_request"]), requireReason(), controller.createRestoreRequest);
backupRecoveryRoutes.post("/restore/requests/:id/approve", requireAnyPermission(["backup_recovery.restore.apply", "backup.restore_approve"]), requireReason(), controller.approveRestoreRequest);
backupRecoveryRoutes.post("/restore/requests/:id/reject", requireAnyPermission(["backup_recovery.restore.cancel", "backup.restore_approve"]), requireReason(), controller.rejectRestoreRequest);

backupRecoveryRoutes.get("/backups", requireAnyPermission(["backup_recovery.view", "backup.view_history"]), controller.listBackups);
backupRecoveryRoutes.post("/backups", requireAnyPermission(["backup_recovery.backup.create", "backup.create"]), requireReason(), controller.createBackup);
backupRecoveryRoutes.post("/backups/create", requireAnyPermission(["backup_recovery.backup.create", "backup.create"]), requireReason(), controller.createBackup);
backupRecoveryRoutes.post("/backups/:id/generate", requireAnyPermission(["backup_recovery.backup.generate", "backup_recovery.backup.create", "backup.create"]), requireReason(), controller.generateBackup);
backupRecoveryRoutes.get("/backups/:id/download", requireAnyPermission(["backup_recovery.backup.download", "backup.download"]), controller.downloadBackup);
backupRecoveryRoutes.post("/backups/:id/verify", requireAnyPermission(["backup_recovery.view", "backup.view"]), requireReason(), controller.verifyBackup);
backupRecoveryRoutes.post("/backups/:id/cancel", requireAnyPermission(["backup_recovery.backup.cancel", "backup.manage_settings"]), requireReason(), controller.cancelBackup);
backupRecoveryRoutes.post("/backups/:id/delete", requireAnyPermission(["backup_recovery.backup.cancel", "backup.manage_settings"]), requireReason(), controller.deleteBackup);
backupRecoveryRoutes.get("/backups/:id", requireAnyPermission(["backup_recovery.view", "backup.view"]), controller.getBackup);

export { backupRecoveryRoutes };
