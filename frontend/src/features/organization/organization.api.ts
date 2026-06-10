import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { AccessLevel, LevelRoleTemplate, LevelRoleTemplateFilters, LevelRoleTemplatePayload } from "./organization.types";

export const organizationApi = {
  accessLevels: () => api.get<{ levels: AccessLevel[] }>("/organization/access-levels"),
  levelRoleTemplates: (filters: LevelRoleTemplateFilters = {}) =>
    api.get<LevelRoleTemplate[]>(`/organization/level-role-templates${buildQueryString(filters)}`),
  createLevelRoleTemplate: (payload: LevelRoleTemplatePayload) =>
    api.post<{ template: LevelRoleTemplate }>("/organization/level-role-templates", payload),
  updateLevelRoleTemplate: (id: string, payload: Partial<LevelRoleTemplatePayload>) =>
    api.patch<{ template: LevelRoleTemplate }>(`/organization/level-role-templates/${id}`, payload),
  archiveLevelRoleTemplate: (id: string) =>
    api.delete<{ archived: boolean }>(`/organization/level-role-templates/${id}`),
};
