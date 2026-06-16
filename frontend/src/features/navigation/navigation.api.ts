import { api } from "@/lib/api-client";
import type { NavigationBadges } from "@/types/navigation";

export interface NavigationBadgesResponse {
  badges: NavigationBadges;
  generated_at?: string;
}

export const navigationApi = {
  badges: () => api.get<NavigationBadgesResponse>("/navigation/badges", { background: true, timeoutMs: 8_000 }),
};
