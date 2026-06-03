import { api } from "@/lib/api-client";
import type { FeatureSetting, FeatureSettingsResponse, SettingsGroup, SettingsGroupResponse, UpdateFeaturePayload } from "./settings.types";

export const settingsApi = {
  all: () => api.get<{ settings: unknown[] }>("/settings"),
  group: (group: SettingsGroup) => api.get<SettingsGroupResponse>(`/settings/${group}`),
  updateGroup: (group: SettingsGroup, payload: { settings: Record<string, Record<string, unknown>>; reason: string; effective_date?: string }) =>
    api.patch<{ updated: boolean; group: string; settings: string[] }>(`/settings/${group}`, payload),
  features: () => api.get<FeatureSettingsResponse>("/settings/features"),
  feature: (featureKey: string) => api.get<FeatureSetting>(`/settings/features/${featureKey}`),
  updateFeature: (featureKey: string, payload: UpdateFeaturePayload) =>
    api.patch<{ updated: boolean; feature: FeatureSetting }>(`/settings/features/${featureKey}`, payload),
  approvals: () => api.get<{ setting_key: string; value: Record<string, unknown> }>("/settings/approvals"),
};
