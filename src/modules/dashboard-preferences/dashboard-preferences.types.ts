export const DASHBOARD_TYPES = ["ADMIN_COMMAND_CENTER", "SELF_SERVICE_DASHBOARD"] as const;

export type DashboardType = typeof DASHBOARD_TYPES[number];

export type DashboardWidgetSize = "small" | "medium" | "wide";

export interface DashboardWidgetPreference {
  id: string;
  visible: boolean;
  order: number;
  size?: DashboardWidgetSize;
}

export interface DashboardLayout {
  version: number;
  widgets: DashboardWidgetPreference[];
  density?: "compact" | "comfortable";
}

export interface DashboardPreferenceResponse {
  dashboard_type: DashboardType;
  layout: DashboardLayout | null;
  updated_at: string | null;
}

export interface DashboardPreferenceRecord {
  id: string;
  company_id: string;
  user_id: string;
  dashboard_type: DashboardType;
  layout_json: string;
  version: number;
  density: string | null;
  created_at: string;
  updated_at: string;
}
