import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { sanitizeBackupRows, sanitizeBackupValue } from "./backup-recovery-sanitize";
import type { BackupCreatePayload, BackupFilters, BackupJob, BackupRestoreSettingsPayload, RestoreApplyPayload, RestoreJobPayload, RestoreRequest, RestoreRequestPayload, RetentionPolicyPayload } from "./backup-recovery.types";

export const backupRecoveryApi = {
  status: async () => {
    const response = await api.get<Record<string, unknown>>("/backup-recovery/status");
    return { ...response, data: sanitizeBackupValue(response.data) };
  },
  listBackups: async (filters: BackupFilters = {}) => {
    const response = await api.get<BackupJob[]>(`/backup-recovery/backups${buildQueryString(filters)}`);
    return { ...response, data: sanitizeBackupRows(response.data) };
  },
  getBackup: async (id: string) => {
    const response = await api.get<BackupJob>(`/backup-recovery/backups/${id}`);
    return { ...response, data: sanitizeBackupValue(response.data) };
  },
  createBackup: (payload: BackupCreatePayload) => api.post<BackupJob>("/backup-recovery/backups", payload),
  generateBackup: (id: string, reason: string) => api.post<BackupJob>(`/backup-recovery/backups/${id}/generate`, { reason }),
  cancelBackup: (id: string, reason: string) => api.post<BackupJob>(`/backup-recovery/backups/${id}/cancel`, { reason }),
  downloadBackup: (id: string) => api.download(`/backup-recovery/backups/${id}/download`),
  verifyBackup: (id: string, reason: string) => api.post<BackupJob>(`/backup-recovery/backups/${id}/verify`, { reason }),
  deleteBackup: (id: string, reason: string) => api.post<{ deleted: boolean }>(`/backup-recovery/backups/${id}/delete`, { reason }),
  getRetentionPolicy: async () => {
    const response = await api.get<Record<string, unknown>>("/backup-recovery/retention-policy");
    return { ...response, data: sanitizeBackupValue(response.data) };
  },
  updateRetentionPolicy: (payload: RetentionPolicyPayload) => api.patch<Record<string, unknown>>("/backup-recovery/retention-policy", payload),
  getSettings: async () => {
    const response = await api.get<Record<string, unknown>>("/backup-recovery/settings");
    return { ...response, data: sanitizeBackupValue(response.data) };
  },
  updateSettings: (payload: BackupRestoreSettingsPayload) => api.patch<Record<string, unknown>>("/backup-recovery/settings", payload),
  listRestoreJobs: async (filters: BackupFilters = {}) => {
    const response = await api.get<RestoreRequest[]>(`/backup-recovery/restores${buildQueryString(filters)}`);
    return { ...response, data: sanitizeBackupRows(response.data) };
  },
  createRestoreJob: (payload: RestoreJobPayload) => api.post<RestoreRequest>("/backup-recovery/restores", payload),
  validateRestoreJob: (id: string) => api.post<RestoreRequest>(`/backup-recovery/restores/${id}/validate`, {}),
  previewRestoreJob: (id: string) => api.post<RestoreRequest>(`/backup-recovery/restores/${id}/preview`, {}),
  applyRestoreJob: (id: string, payload: RestoreApplyPayload) => api.post<RestoreRequest>(`/backup-recovery/restores/${id}/apply`, payload),
  cancelRestoreJob: (id: string, reason: string) => api.post<RestoreRequest>(`/backup-recovery/restores/${id}/cancel`, { reason }),
  listRestoreRequests: async (filters: BackupFilters = {}) => {
    const response = await api.get<RestoreRequest[]>(`/backup-recovery/restore/requests${buildQueryString(filters)}`);
    return { ...response, data: sanitizeBackupRows(response.data) };
  },
  getRestoreRequest: async (id: string) => {
    const response = await api.get<RestoreRequest>(`/backup-recovery/restore/requests/${id}`);
    return { ...response, data: sanitizeBackupValue(response.data) };
  },
  createRestoreRequest: (payload: RestoreRequestPayload) => api.post<RestoreRequest>("/backup-recovery/restore/request", payload),
  approveRestoreRequest: (id: string, reason: string) => api.post<RestoreRequest>(`/backup-recovery/restore/requests/${id}/approve`, { reason }),
  rejectRestoreRequest: (id: string, reason: string) => api.post<RestoreRequest>(`/backup-recovery/restore/requests/${id}/reject`, { reason }),
};
