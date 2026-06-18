export type SettingsGroup =
  | "company"
  | "features"
  | "attendance"
  | "leave"
  | "long_leave"
  | "holidays"
  | "payroll"
  | "approval_workflows"
  | "assets_uniforms"
  | "documents"
  | "backup_recovery"
  | "notifications"
  | "reports"
  | "import_export"
  | "offline_sync"
  | "audit_security";

export interface CompanySetting {
  id: string;
  setting_key: string;
  setting_group?: string | null;
  value: Record<string, unknown>;
  effective_from?: string | null;
  updated_at?: string;
}

export interface FeatureSetting {
  id: string;
  feature_key: string;
  feature_name: string;
  is_enabled: number;
  status: string;
  affects_payroll?: number;
  affects_attendance?: number;
  affects_leave?: number;
  affects_roster?: number;
  audit_enabled?: number;
  effective_from?: string | null;
  updated_at?: string;
}

export interface SettingsGroupResponse {
  group: SettingsGroup | string;
  settings: CompanySetting[];
}

export interface FeatureSettingsResponse {
  features: FeatureSetting[];
}

export interface UpdateFeaturePayload {
  is_enabled?: boolean;
  status?: string;
  reason: string;
  effective_from?: string;
}

export interface CompanyProfile {
  company_name: string;
  legal_name: string | null;
  registration_number: string | null;
  tax_number: string | null;
  company_email: string | null;
  company_phone: string | null;
  website: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  logo_url: string | null;
  updated_at: string;
}
