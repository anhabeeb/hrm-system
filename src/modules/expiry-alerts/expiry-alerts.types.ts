export type ExpiryAlertSeverity = "info" | "warning" | "high" | "critical";
export type ExpiryAlertStatus = "open" | "acknowledged" | "snoozed" | "resolved" | "dismissed";
export type ExpirySourceType =
  | "employee_document"
  | "employee_passport"
  | "employee_work_permit"
  | "contract"
  | "probation"
  | "long_leave_return"
  | "asset_assignment"
  | "uniform_return";

export interface ExpiryAlertRecord {
  id: string;
  company_id: string;
  employee_id: string | null;
  user_id: string | null;
  outlet_id: string | null;
  department_id: string | null;
  source_type: ExpirySourceType | string;
  source_table: string;
  source_id: string;
  source_label: string;
  expiry_date: string;
  days_until_expiry: number;
  alert_type: string;
  severity: ExpiryAlertSeverity | string;
  status: ExpiryAlertStatus | string;
  title: string;
  message: string;
  action_url: string | null;
  notification_id: string | null;
  email_notification_id: string | null;
  idempotency_key: string;
  first_detected_at: string;
  last_detected_at: string;
  last_notified_at: string | null;
  next_notification_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  resolution_note: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpiryAlertSettingsRecord {
  id: string;
  company_id: string;
  enabled: number;
  warning_days_json: string;
  overdue_enabled: number;
  repeat_frequency: string;
  quiet_days: number;
  in_app_enabled: number;
  email_enabled: number;
  minimum_email_severity: ExpiryAlertSeverity | string;
  notify_roles_json: string;
  notify_permissions_json: string;
  notify_employee_self: number;
  fallback_to_admins: number;
  include_archived_employees: number;
  include_inactive_employees: number;
  source_toggles_json: string;
  updated_by: string | null;
  updated_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpiryAlertSettings {
  enabled: boolean;
  warning_days: number[];
  overdue_enabled: boolean;
  repeat_frequency: "daily" | "weekly" | "monthly" | "none";
  quiet_days: number;
  in_app_enabled: boolean;
  email_enabled: boolean;
  minimum_email_severity: ExpiryAlertSeverity;
  notify_roles: string[];
  notify_permissions: string[];
  notify_employee_self: boolean;
  fallback_to_admins: boolean;
  include_archived_employees: boolean;
  include_inactive_employees: boolean;
  source_toggles: Record<string, boolean>;
  updated_by?: string | null;
  updated_reason?: string | null;
}

export interface ExpiryAlertListFilters {
  status?: string;
  severity?: string;
  source_type?: string;
  source_types?: string[];
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  alert_type?: string;
  from_date?: string;
  to_date?: string;
  include_closed?: boolean;
  page: number;
  page_size: number;
}

export interface ExpiryScanFilters {
  as_of_date: string;
  through_date?: string;
  warning_days?: number[];
  source_type?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  include_archived_employees?: boolean;
  include_inactive_employees?: boolean;
}

export interface ExpirySettingsInput extends Partial<Omit<ExpiryAlertSettings, "source_toggles">> {
  source_toggles?: Record<string, boolean>;
  reason: string;
}

export interface ExpiryActionInput {
  reason?: string;
  snoozed_until?: string;
}

export interface ExpirySourceRow {
  source_type: ExpirySourceType;
  source_table: string;
  source_id: string;
  source_label: string;
  expiry_date: string;
  employee_id?: string | null;
  employee_code?: string | null;
  employee_name?: string | null;
  employee_type?: string | null;
  employment_status?: string | null;
  outlet_id?: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ExpiryAlertCandidate extends ExpirySourceRow {
  company_id: string;
  days_until_expiry: number;
  alert_type: "upcoming_expiry" | "due_today" | "overdue";
  severity: ExpiryAlertSeverity;
  title: string;
  message: string;
  action_url: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
}
