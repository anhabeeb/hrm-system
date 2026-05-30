export type ApprovalMode =
  | "disabled"
  | "manual"
  | "auto_admin_superadmin"
  | "full_workflow";

export type SettingsGroup =
  | "company"
  | "features"
  | "employees"
  | "outlets"
  | "departments_positions"
  | "payroll"
  | "payroll_earnings"
  | "leave"
  | "long_leave"
  | "holidays"
  | "attendance"
  | "roster"
  | "assets_uniforms"
  | "documents"
  | "users_permissions"
  | "approval_workflows"
  | "approval_thresholds"
  | "notifications"
  | "reports"
  | "offline_sync"
  | "realtime_websocket"
  | "import_export"
  | "backup_recovery"
  | "audit_security"
  | "my_profile"
  | "ui_preferences";

export interface FeatureSettingRecord {
  id: string;
  company_id: string;
  feature_key: string;
  feature_name: string;
  is_enabled: number;
  status: string;
  applies_to_all_outlets: number;
  allowed_outlet_ids_json: string | null;
  allowed_role_ids_json: string | null;
  affects_payroll: number;
  affects_attendance: number;
  affects_leave: number;
  affects_roster: number;
  offline_enabled: number;
  audit_enabled: number;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingRecord {
  id: string;
  company_id: string;
  setting_key: string;
  setting_group: string | null;
  setting_value_json: string;
  effective_from: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingsChangeLogRecord {
  id: string;
  company_id: string;
  setting_group: string;
  setting_key: string;
  old_value_json: string | null;
  new_value_json: string | null;
  changed_by: string;
  reason: string | null;
  effective_date: string | null;
  version: number;
  created_at: string;
}

export interface ApprovalThresholdRecord {
  id: string;
  company_id: string;
  workflow_key: string;
  threshold_name: string;
  threshold_type: string;
  amount_min: number | null;
  amount_max: number | null;
  percentage_min: number | null;
  percentage_max: number | null;
  currency: string | null;
  required_roles_json: string | null;
  required_permissions_json: string | null;
  is_active: number;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateSettingsGroupInput {
  settings: Record<string, Record<string, unknown>>;
  reason: string;
  effective_date?: string;
}

export interface UpdateFeatureInput {
  is_enabled?: boolean;
  status?: string;
  applies_to_all_outlets?: boolean;
  allowed_outlet_ids_json?: string[] | null;
  allowed_role_ids_json?: string[] | null;
  effective_from?: string;
  reason: string;
}

export interface BulkUpdateFeaturesInput {
  features: Record<string, Omit<UpdateFeatureInput, "reason">>;
  reason: string;
  effective_from?: string;
}

export interface UpdateApprovalSettingsInput {
  approval_workflows_enabled?: boolean;
  approval_mode?: ApprovalMode;
  require_approval_if_only_admin_superadmin_exist?: boolean;
  auto_approve_for_admin_superadmin?: boolean;
  require_reason_when_approvals_disabled?: boolean;
  audit_when_approvals_disabled?: boolean;
  reason: string;
  effective_date?: string;
}

export interface UpdateApprovalThresholdInput {
  threshold_name?: string;
  threshold_type?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  percentage_min?: number | null;
  percentage_max?: number | null;
  currency?: string;
  required_roles_json?: string[] | null;
  required_permissions_json?: string[] | null;
  is_active?: boolean;
  effective_from?: string;
  reason: string;
}

export interface SettingsChangeLogFilters {
  date_from?: string;
  date_to?: string;
  setting_group?: string;
  setting_key?: string;
  changed_by?: string;
  effective_date?: string;
}

export interface ApprovalThresholdFilters {
  workflow_key?: string;
  threshold_type?: string;
  is_active?: boolean;
}
