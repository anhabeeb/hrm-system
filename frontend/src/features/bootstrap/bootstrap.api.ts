import { api } from "@/lib/api-client";
import type { BootstrapInitializePayload } from "./setup.types";

export interface BootstrapStatus {
  setup_required: boolean;
  remember_me_allowed?: boolean;
}

export interface ApiHealthStatus {
  success: true;
  status: "ok" | string;
  service: string;
  timestamp: string;
  version: string;
  requestId: string;
}

export const bootstrapApi = {
  health: () => api.get<ApiHealthStatus>("/health", { suppressSessionExpired: true }),
  status: () => api.get<BootstrapStatus>("/bootstrap/status"),
  initialize: (payload: BootstrapInitializePayload, token: string) =>
    api.post<Record<string, unknown>>("/bootstrap/initialize", payload, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      suppressSessionExpired: true,
    }),
};
