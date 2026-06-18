import { api } from "@/lib/api-client";

import type { SetupGuideOverview, SetupGuideProgress } from "./setupGuide.types";

export const setupGuideApi = {
  status: () => api.get<SetupGuideProgress>("/setup-guide/status", { background: true }),
  activities: () => api.get<SetupGuideOverview>("/setup-guide/activities"),
  start: (activityKey: string) => api.post<SetupGuideOverview>(`/setup-guide/activities/${activityKey}/start`),
  complete: (activityKey: string, reason?: string) =>
    api.post<SetupGuideOverview>(`/setup-guide/activities/${activityKey}/complete`, { reason }),
  skip: (activityKey: string, reason: string) =>
    api.post<SetupGuideOverview>(`/setup-guide/activities/${activityKey}/skip`, { reason }),
  resume: (activityKey: string) => api.post<SetupGuideOverview>(`/setup-guide/activities/${activityKey}/resume`),
  finish: () => api.post<SetupGuideProgress>("/setup-guide/finish"),
  skipForNow: (reason?: string) => api.post<SetupGuideProgress>("/setup-guide/skip-for-now", { reason }),
  recalculate: () => api.post<SetupGuideOverview>("/setup-guide/recalculate"),
  moduleChoice: (payload: { module_key: string; is_enabled: boolean; reason?: string }) =>
    api.post<SetupGuideOverview>("/setup-guide/module-choice", payload),
};
