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
  requests: SelfRequest[];
  pending_approvals: SelfPendingApproval[];
}
