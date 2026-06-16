import type { DashboardQuickAction } from "./dashboard.types";

export type WidgetStatus = "ready" | "needs_review" | "blocked" | "empty";

export interface DashboardWidgetState<TMetrics = Record<string, unknown>, TRow = unknown> {
  enabled: boolean;
  visible: boolean;
  title: string;
  description?: string;
  metrics?: TMetrics;
  rows?: TRow[];
  status?: WidgetStatus;
  warnings?: string[];
  actions?: DashboardQuickAction[];
}

export interface PeopleSnapshotMetrics {
  total_active_employees: number;
  new_hires_this_month: number;
  employees_without_login: number;
  employees_without_structure: number;
  employees_missing_level: number;
  employees_in_notice_period: number;
}

export interface AttendancePulseMetrics {
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  sick: number;
  missing_punch: number;
  pending_corrections: number;
}

export interface ApprovalQueueRow {
  id: string;
  moduleName: string;
  count: number;
  oldestPendingAge?: string | null;
  priority?: string | null;
  href?: string | null;
}

export interface PayrollReadinessMetrics {
  current_payroll_period: string | null;
  pay_date: string | null;
  pending_attendance_corrections: number;
  missing_punches: number;
  approved_advances_deductions: number;
  pending_payroll_adjustments: number;
  payslip_generation_status: string | null;
  payroll_locked_or_finalized: boolean;
}

export interface DocumentExpiryMetrics {
  expiring_30_days: number;
  expiring_60_days: number;
  missing_critical_documents: number;
  pending_kyc_updates: number;
  pending_document_approvals: number;
}

export interface RosterCoverageMetrics {
  scheduled_today: number;
  open_shifts: number;
  employees_on_leave_today: number;
  roster_conflicts: number;
  unassigned_employees: number;
  pending_roster_changes: number;
}

export interface DepartmentHealthRow {
  department_id?: string | null;
  department_name?: string | null;
  total?: number;
  present?: number;
  expected?: number;
  pending_approvals?: number;
  missing_documents?: number;
  roster_gaps?: number;
  employees_missing_structure?: number;
}

export interface AttentionItem {
  id: string;
  category: string;
  title: string;
  count: number;
  priority: string;
  href?: string;
}

export interface LifecycleMetrics {
  employees_in_notice_period: number;
  offboarding_tasks_pending: number;
  final_settlement_review_pending: number;
  access_disable_review_pending: number;
  exit_interviews_pending: number;
}

export interface DisciplinaryFollowUpMetrics {
  pending_reviews: number;
  pending_acknowledgements: number;
  open_follow_up_tasks: number;
  high_severity_cases_pending: number;
}

export interface OperationOwnershipHealthMetrics {
  operations_missing_owner: number;
  operations_missing_final_approver: number;
  operations_missing_executor: number;
  operations_using_super_admin_fallback: number;
  operations_blocked_by_fallback: number;
  functions_without_assigned_users: number;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description?: string | null;
  timestamp?: string | null;
  status?: string | null;
}

export interface CommandCenterResponse {
  header: {
    greeting_name: string;
    today: string;
    company_name: string | null;
    outlet_name: string | null;
    summary: {
      present_today: number;
      absent_today: number;
      pending_approvals: number;
      payroll_status: string | null;
    };
    quick_actions: DashboardQuickAction[];
  };
  widgets: {
    people_snapshot: DashboardWidgetState<PeopleSnapshotMetrics>;
    attendance_pulse: DashboardWidgetState<AttendancePulseMetrics>;
    approval_queue: DashboardWidgetState<Record<string, never>, ApprovalQueueRow>;
    payroll_readiness: DashboardWidgetState<PayrollReadinessMetrics>;
    document_expiry: DashboardWidgetState<DocumentExpiryMetrics>;
    roster_coverage: DashboardWidgetState<RosterCoverageMetrics>;
    department_health: DashboardWidgetState<Record<string, never>, DepartmentHealthRow>;
    employee_attention: DashboardWidgetState<Record<string, never>, AttentionItem>;
    lifecycle: DashboardWidgetState<LifecycleMetrics>;
    disciplinary_follow_up: DashboardWidgetState<DisciplinaryFollowUpMetrics>;
    operation_ownership_health: DashboardWidgetState<OperationOwnershipHealthMetrics>;
    recent_activity: DashboardWidgetState<Record<string, never>, RecentActivityItem>;
  };
  warnings: string[];
  generated_at: string;
}
