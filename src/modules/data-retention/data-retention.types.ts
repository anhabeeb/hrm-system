import type { ARCHIVE_SOURCE_TYPES } from "./data-retention.constants";

export type ArchiveSourceType = typeof ARCHIVE_SOURCE_TYPES[number];

export interface RetentionSettingsInput {
  enabled?: boolean;
  default_retention_months?: number;
  archive_only_mode?: boolean;
  purge_enabled?: boolean;
  require_backup_before_archive?: boolean;
  backup_required_max_age_days?: number;
  active_attendance_window_days?: number;
  include_archived_records_in_reports_by_default?: boolean;
  allow_restore_from_archive?: boolean;
  source_retention_months?: Record<string, number>;
  reason: string;
}

export interface ArchiveListFilters {
  source_type?: string;
  status?: string;
  requested_by?: string;
  page: number;
  page_size: number;
}

export interface ArchivePreviewInput {
  source_type: ArchiveSourceType;
  cutoff_date?: string;
  retention_months?: number;
  page_size: number;
  reason?: string;
  idempotency_key?: string;
}

export interface ArchiveApplyInput {
  confirmation: string;
  reason: string;
}

export interface ArchiveItemActionInput {
  reason: string;
}

export interface ArchiveCandidate {
  id: string;
  sourceType: ArchiveSourceType;
  sourceTable: string;
  employeeId: string | null;
  outletId: string | null;
  departmentId: string | null;
  status: string | null;
  dateValue: string | null;
  eligible: boolean;
  blockedReason: string | null;
  warningCode?: string | null;
  warningMessage?: string | null;
}
