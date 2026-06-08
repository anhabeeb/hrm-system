export type ExpiryAlertSeverity = "info" | "warning" | "high" | "critical";
export type ExpiryAlertStatus = "open" | "acknowledged" | "snoozed" | "resolved" | "dismissed";

export interface ExpiryAlert {
  id: string;
  employee_id?: string | null;
  outlet_id?: string | null;
  department_id?: string | null;
  source_type: string;
  source_label: string;
  expiry_date: string;
  days_until_expiry: number;
  alert_type: string;
  severity: ExpiryAlertSeverity;
  status: ExpiryAlertStatus;
  title: string;
  message: string;
  action_url?: string | null;
  first_detected_at: string;
  last_detected_at: string;
  last_notified_at?: string | null;
  next_notification_at?: string | null;
  snoozed_until?: string | null;
  resolution_note?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ExpiryAlertFilters {
  status?: string;
  severity?: string;
  source_type?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  alert_type?: string;
  from_date?: string;
  to_date?: string;
  include_closed?: boolean;
  page?: number;
  page_size?: number;
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
  updated_reason?: string | null;
}

export interface ExpiryScanInput {
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

export interface ExpiryAlertSummary {
  active_count: number;
  open_count: number;
  critical_count: number;
  high_count?: number;
  warning_count?: number;
  overdue_count: number;
  due_today_count: number;
  due_7_days_count?: number;
  due_30_days_count?: number;
  by_source_type?: Record<string, number>;
}
