import type { DashboardType, DashboardWidgetDefinition, DashboardWidgetSize } from "@/config/dashboardWidgets";

export type { DashboardType, DashboardWidgetDefinition, DashboardWidgetSize };

export interface DashboardWidgetPreference {
  id: string;
  visible: boolean;
  order: number;
  size?: DashboardWidgetSize;
}

export interface DashboardLayout {
  version: 1;
  widgets: DashboardWidgetPreference[];
  density?: "compact" | "comfortable";
}

export interface DashboardPreference {
  dashboard_type: DashboardType;
  layout: DashboardLayout | null;
  updated_at: string | null;
}

export interface PersonalizedDashboardWidget extends DashboardWidgetDefinition {
  visible: boolean;
  order: number;
  size?: DashboardWidgetSize;
}
