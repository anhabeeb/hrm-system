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
    department_name: string | null;
    position_title: string | null;
    level: number | null;
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

export interface SelfRequest {
  id: string;
  operation_type: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary?: string | null;
  status: string;
  current_step_name?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface SelfPendingApproval extends SelfRequest {
  step_id?: string;
  department_name?: string | null;
}

export interface SelfDashboard {
  profile: SelfProfile;
  navigation: SelfNavigationItem[];
  widgets: SelfDashboardWidget[];
  employee?: SelfProfile["employee"];
  header?: {
    today: string;
    greeting_name: string | null;
    current_shift: { date: string | null; start_time: string | null; end_time: string | null; status: string | null } | null;
    today_status: string | null;
    payroll_period: { start_date: string; end_date: string; pay_date: string; status?: string | null; is_derived?: boolean } | null;
  };
  modern_widgets?: SelfDashboardModernWidgets;
  quick_actions?: SelfDashboardQuickAction[];
  warnings?: string[];
  requests: SelfRequest[];
  pending_approvals: SelfPendingApproval[];
}
