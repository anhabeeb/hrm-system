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

export interface SelfDashboard {
  profile: SelfProfile;
  navigation: SelfNavigationItem[];
  widgets: SelfDashboardWidget[];
  requests: unknown[];
  pending_approvals: unknown[];
}
