import type { AuthActor } from "../../types/api.types";

export type DashboardSection =
  | "summary"
  | "attention"
  | "attendance_today"
  | "approvals"
  | "expiry_alerts"
  | "device_health"
  | "payroll_readiness"
  | "quick_actions";

export interface DashboardMeta {
  scope: "company" | "outlet";
  outlet_ids: string[];
  today: string;
  generated_at: string;
}

export interface DashboardQueryContext {
  actor: AuthActor;
  today: string;
  weekEnd: string;
  monthEnd: string;
  generatedAt: string;
}

export interface DashboardCountRow {
  total?: number | null;
  [key: string]: number | string | null | undefined;
}

export interface DashboardQuickAction {
  key: string;
  label: string;
  description: string;
  href: string;
  permission: string;
  category: string;
}

export interface DashboardAttentionItem {
  id: string;
  area: string;
  title: string;
  count: number;
  priority: "low" | "normal" | "high" | "urgent";
  href: string;
}
