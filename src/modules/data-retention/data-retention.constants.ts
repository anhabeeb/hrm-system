export const DATA_RETENTION_SETTINGS_KEY = "data_retention.settings";
export const ARCHIVE_CONFIRMATION_PHRASE = "ARCHIVE DATA";

export const ARCHIVE_SOURCE_TYPES = [
  "employees",
  "employee_documents",
  "attendance",
  "biometric_logs",
  "leave",
  "long_leave",
  "payroll",
  "payslips",
  "notifications",
  "email_notifications",
  "expiry_alerts",
  "imports",
  "exports",
  "backup_restore",
  "audit_logs",
  "mixed",
] as const;

export const ARCHIVE_JOB_STATUSES = [
  "pending",
  "preview_ready",
  "processing",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;

export const DEFAULT_DATA_RETENTION_SETTINGS = {
  enabled: true,
  default_retention_months: 36,
  archive_only_mode: true,
  purge_enabled: false,
  require_backup_before_archive: false,
  backup_required_max_age_days: 30,
  active_attendance_window_days: 60,
  require_super_admin_for_destructive_actions: true,
  require_typed_confirmation: true,
  confirmation_phrase: ARCHIVE_CONFIRMATION_PHRASE,
  include_archived_records_in_reports_by_default: false,
  allow_restore_from_archive: true,
  reason_required_for_policy_changes: true,
  source_retention_months: {
    attendance: 36,
    biometric_logs: 12,
    payroll: 84,
    payslips: 84,
    leave: 60,
    long_leave: 84,
    employee_documents: 60,
    notifications: 6,
    email_notifications: 6,
    expiry_alerts: 24,
    imports: 12,
    exports: 12,
    backup_restore: 12,
    audit_logs: 120,
    employees: 84,
  },
};
