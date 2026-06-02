import { api } from "@/lib/api-client";
import type { BootstrapInitializePayload } from "./setup.types";

export interface BootstrapStatus {
  setup_required: boolean;
}

export const bootstrapApi = {
  status: () => api.get<BootstrapStatus>("/bootstrap/status"),
  initialize: (payload: BootstrapInitializePayload, token: string) =>
    api.post<Record<string, unknown>>("/bootstrap/initialize", payload, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      suppressSessionExpired: true,
    }),
};
