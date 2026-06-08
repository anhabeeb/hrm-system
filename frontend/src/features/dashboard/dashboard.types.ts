export interface DashboardEnvelope<T> {
  data: T;
  meta: {
    scope: "company" | "outlet";
    outlet_ids: string[];
    today: string;
    generated_at: string;
  };
  generated_at: string;
}

export interface DashboardSummary {
  employee_summary?: {
    total_active_employees: number;
    local_employees: number;
    foreign_employees: number;
    employees_on_probation: number;
    employees_on_leave: number;
    employees_on_long_leave: number;
    employees_with_critical_expiry_alerts: number;
    by_outlet: Array<Record<string, unknown>>;
    by_department: Array<Record<string, unknown>>;
  } | null;
  attendance_today?: {
    present_today: number;
    absent_today: number;
    late_checkins_today: number;
    missing_checkin_count: number;
    missing_checkout_count: number;
    overtime_today: number;
    holiday_work_today: number;
    attendance_exceptions_open: number;
    href: string;
  } | null;
  leave_approvals?: {
    pending_leave_approvals: number;
    approval_inbox_count: number;
    leave_requests_submitted_today: number;
    leave_requests_submitted_this_week: number;
    rejected_cancelled_leave_summary: number;
    low_leave_balance_warnings: number;
    negative_balance_warnings: number;
    href: string;
  } | null;
  long_leave?: {
    employees_currently_on_long_leave: number;
    long_leave_pending_approval: number;
    expected_returns_this_week: number;
    expected_returns_this_month: number;
    overdue_returns: number;
    payroll_review_required: number;
    long_leave_payroll_impacts_pending_review: number;
    href: string;
  } | null;
  expiry_alerts?: {
    critical_alerts: number;
    due_today: number;
    due_within_7_days: number;
    due_within_30_days: number;
    overdue_expired: number;
    passport_alerts: number;
    visa_work_permit_alerts: number;
    contract_probation_document_alerts: number;
    href: string;
  } | null;
  notifications_email_health?: {
    unread_in_app_notifications: number;
    urgent_notifications: number;
    pending_email_jobs: number | null;
    failed_email_jobs: number | null;
    href: string;
  } | null;
  device_health?: {
    active_devices: number;
    offline_devices: number;
    suspended_revoked_devices: number;
    unmatched_biometric_punches: number;
    ambiguous_biometric_punches: number;
    invalid_timestamp_punches: number;
    href: string;
  } | null;
  holiday_roster_context?: {
    todays_holidays: Array<Record<string, unknown>>;
    upcoming_holidays: Array<Record<string, unknown>>;
    holiday_roster_warnings: number;
    open_roster_conflicts: number;
    unpublished_roster_warnings: number;
    href: string;
  } | null;
  payroll_readiness?: {
    attendance_exceptions: number;
    missing_punches: number;
    long_leave_payroll_review: number;
    pending_salary_changes: number;
    pending_leave_adjustments: number;
    approved_leave_not_finalized: number;
    unfinalized_payroll_warning: boolean;
    href: string;
  } | null;
}

export interface DashboardAttentionItem {
  id: string;
  area: string;
  title: string;
  count: number;
  priority: "low" | "normal" | "high" | "urgent";
  href: string;
}

export interface DashboardQuickAction {
  key: string;
  label: string;
  description: string;
  href: string;
  permission: string;
  category: string;
}
