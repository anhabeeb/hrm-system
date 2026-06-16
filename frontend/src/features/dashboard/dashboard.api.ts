import { api } from "@/lib/api-client";
import type { CommandCenterResponse } from "./commandCenter.types";
import type { DashboardAttentionItem, DashboardEnvelope, DashboardQuickAction, DashboardSummary } from "./dashboard.types";

export const dashboardApi = {
  commandCenter: () => api.get<DashboardEnvelope<CommandCenterResponse>>("/dashboard/command-center"),
  summary: () => api.get<DashboardEnvelope<DashboardSummary>>("/dashboard/summary"),
  attention: () => api.get<DashboardEnvelope<DashboardAttentionItem[]>>("/dashboard/attention"),
  quickActions: () => api.get<DashboardEnvelope<DashboardQuickAction[]>>("/dashboard/quick-actions"),
};
