import { api } from "@/lib/api-client";

import type { DashboardEnvelope } from "./dashboard.types";
import type { CommandCenterResponse } from "./commandCenter.types";

export const commandCenterApi = {
  get: () => api.get<DashboardEnvelope<CommandCenterResponse>>("/dashboard/command-center"),
};
