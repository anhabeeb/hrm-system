import { api } from "@/lib/api-client";

import type { DashboardSummary } from "./dashboard.types";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/reports/dashboard/summary"),
};
