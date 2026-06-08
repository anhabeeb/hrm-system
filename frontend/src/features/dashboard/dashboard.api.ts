import { api } from "@/lib/api-client";
import type { DashboardAttentionItem, DashboardEnvelope, DashboardQuickAction, DashboardSummary } from "./dashboard.types";

export const dashboardApi = {
  summary: () => api.get<DashboardEnvelope<DashboardSummary>>("/dashboard/summary"),
  attention: () => api.get<DashboardEnvelope<DashboardAttentionItem[]>>("/dashboard/attention"),
  quickActions: () => api.get<DashboardEnvelope<DashboardQuickAction[]>>("/dashboard/quick-actions"),
};
