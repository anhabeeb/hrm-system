export type SettingsGroup =
  | "company"
  | "features"
  | "attendance"
  | "leave"
  | "payroll"
  | "approval_workflows"
  | "documents"
  | "backup_recovery";

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
