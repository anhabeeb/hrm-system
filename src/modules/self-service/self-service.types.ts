export interface SelfProfile {
  linked_employee: boolean;
  user: {
    id: string;
    username: string | null;
    email: string | null;
    full_name: string | null;
    status: string | null;
    last_login_at?: string | null;
  };
  employee: {
    id: string;
    employee_code: string | null;
    full_name: string | null;
    profile_photo_url?: string | null;
    department_id: string | null;
    department_name: string | null;
    position_id: string | null;
    position_title: string | null;
    level: number | null;
    outlet_id: string | null;
    outlet_name: string | null;
    employment_status: string | null;
    employment_type: string | null;
    employee_type: string | null;
    nationality: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  roles: string[];
  access_summary: string[];
}

export interface SelfNavigationItem {
  key: string;
  label: string;
  path: string;
  enabled: boolean;
  reason?: string;
}

export interface SelfDashboardWidget {
  key: string;
  title: string;
  enabled: boolean;
  status: "ok" | "empty" | "disabled" | "attention";
  value?: string | number | null;
  description?: string;
  href?: string;
  rows?: Array<{ label: string; value: string | number | null }>;
}

export interface SelfDashboardQuickAction {
  key: string;
  label: string;
  href: string;
  enabled: boolean;
  module_code?: string;
  permission?: string;
}

export interface SelfDashboardHeader {
  today: string;
  greeting_name: string | null;
  current_shift: {
    date: string | null;
    start_time: string | null;
    end_time: string | null;
    status: string | null;
  } | null;
  today_status: string | null;
  payroll_period: {
    start_date: string;
    end_date: string;
    pay_date: string;
    status?: string | null;
    is_derived?: boolean;
  } | null;
}

export interface SelfDashboardModernWidgets {
  attendance_today: Record<string, unknown> & { visible: boolean };
  attendance_calendar_preview: Record<string, unknown> & { visible: boolean };
  leave_balance: Record<string, unknown> & { visible: boolean };
  upcoming_roster: Record<string, unknown> & { visible: boolean };
  pending_requests: Record<string, unknown> & { visible: boolean };
  documents_kyc: Record<string, unknown> & { visible: boolean };
  payslips: Record<string, unknown> & { visible: boolean };
  my_approvals: Record<string, unknown> & { visible: boolean };
  offboarding_status: Record<string, unknown> & { visible: boolean };
  acknowledgements: Record<string, unknown> & { visible: boolean };
  recent_activity: Record<string, unknown> & { visible: boolean };
}

export interface SelfDashboard {
  profile: SelfProfile;
  navigation: SelfNavigationItem[];
  widgets: SelfDashboardWidget[];
  employee?: SelfProfile["employee"];
  header?: SelfDashboardHeader;
  modern_widgets?: SelfDashboardModernWidgets;
  quick_actions?: SelfDashboardQuickAction[];
  warnings?: string[];
  requests: unknown[];
  pending_approvals: unknown[];
}

export type SelfServiceApprovalChainStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "waiting"
  | "skipped"
  | "not_required"
  | "cancelled"
  | "no_approval_required";

export interface SelfServiceApprovalChainStep {
  step_order: number;
  step_key: string;
  step_label: string;
  status: SelfServiceApprovalChainStatus;
  resolver_type: string;
  approver_role_label: string | null;
  approver_level_label: string | null;
  approver_department_label: string | null;
  approver_display_name: string | null;
  approved_by_display_name: string | null;
  approved_at: string | null;
  rejected_by_display_name: string | null;
  rejected_at: string | null;
  comments_visible_to_employee: string | null;
  is_current_step: boolean;
  is_final_step: boolean;
}

export interface SelfServiceApprovalPolicySummary {
  leave_request_id: string | null;
  leave_type_name: string | null;
  date_range: string | null;
  document_required: boolean;
  document_status: string | null;
  document_required_reason: string | null;
  salary_deduction_required: boolean;
  deduction_mode: string | null;
  deduction_source_label: string | null;
  paid_percentage: number | null;
  approval_required: boolean | null;
  approval_workflow_key: string | null;
  payroll_impact_label: string | null;
}

export interface SelfServiceApprovalChainResponse {
  request_id: string;
  request_type: string;
  request_status: string;
  title: string;
  summary: string | null;
  current_step_key: string | null;
  current_step_label: string | null;
  approval_setup_message: string | null;
  policy_summary: SelfServiceApprovalPolicySummary | null;
  approval_chain: SelfServiceApprovalChainStep[];
}
