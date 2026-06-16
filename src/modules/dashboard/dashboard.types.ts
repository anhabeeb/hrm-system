import type { AuthActor } from "../../types/api.types";

export type DashboardSection =
  | "summary"
  | "command_center"
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

export interface CommandCenterWidgetState<T> {
  enabled: boolean;
  visible: boolean;
  title: string;
  description?: string;
  metrics?: T;
  rows?: unknown[];
  status?: "ready" | "needs_review" | "blocked" | "empty";
  error?: "unavailable" | string;
  warnings?: string[];
  actions?: DashboardQuickAction[];
}

export interface CommandCenterResponse {
  header: {
    greeting_name: string;
    today: string;
    company_name: string | null;
    outlet_name: string | null;
    summary: {
      present_today: number;
      absent_today: number;
      pending_approvals: number;
      payroll_status: string | null;
    };
    quick_actions: DashboardQuickAction[];
  };
  widgets: {
    people_snapshot: CommandCenterWidgetState<Record<string, number>>;
    attendance_pulse: CommandCenterWidgetState<Record<string, number>>;
    approval_queue: CommandCenterWidgetState<never>;
    payroll_readiness: CommandCenterWidgetState<Record<string, number | boolean | string | null>>;
    document_expiry: CommandCenterWidgetState<Record<string, number>>;
    roster_coverage: CommandCenterWidgetState<Record<string, number>>;
    department_health: CommandCenterWidgetState<never>;
    employee_attention: CommandCenterWidgetState<never>;
    lifecycle: CommandCenterWidgetState<Record<string, number>>;
    disciplinary_follow_up: CommandCenterWidgetState<Record<string, number>>;
    operation_ownership_health: CommandCenterWidgetState<Record<string, number>>;
    recent_activity: CommandCenterWidgetState<never>;
  };
  warnings: string[];
  generated_at: string;
}
