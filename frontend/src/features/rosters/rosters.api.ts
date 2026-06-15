import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { BulkRosterPayload, RosterChangePayload, RosterChangeRequest, RosterChangeTimeline, RosterConflict, RosterFilters, RosterPayload, RosterShift, ShiftTemplate, ShiftTemplatePayload } from "./rosters.types";

export const rostersApi = {
  list: (filters: RosterFilters = {}) => api.get<RosterShift[]>(`/rosters${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ roster_shift: RosterShift }>(`/rosters/${id}`),
  create: (payload: RosterPayload) => api.post<{ roster_shift: RosterShift; conflicts: RosterConflict[] }>("/rosters", payload),
  update: (id: string, payload: Partial<RosterPayload>) => api.patch<{ roster_shift: RosterShift; conflicts: RosterConflict[] }>(`/rosters/${id}`, payload),
  cancel: (id: string, payload: { reason: string; notes?: string | null }) => api.post<{ roster_shift: RosterShift }>(`/rosters/${id}/cancel`, payload),
  bulk: (payload: BulkRosterPayload) => api.post<{ created: number; skipped_existing: number; roster_shift_ids: string[]; conflicts: RosterConflict[] }>("/rosters/bulk", payload),
  publish: (payload: { outlet_id: string; department_id?: string | null; date_from: string; date_to: string; reason: string }) =>
    api.post<{ published: boolean }>("/rosters/publish", payload),
  conflicts: (filters: RosterFilters = {}) => api.get<RosterConflict[]>(`/rosters/conflicts${buildQueryString(filters)}`),
  resolveConflict: (id: string, payload: { reason: string }) => api.post<{ conflict: RosterConflict }>(`/rosters/conflicts/${id}/resolve`, payload),
  overrideConflict: (id: string, payload: { reason: string }) => api.post<{ conflict: RosterConflict }>(`/rosters/conflicts/${id}/override`, payload),
  listChanges: (filters: RosterFilters = {}) => api.get<RosterChangeRequest[]>(`/rosters/changes${buildQueryString(filters)}`),
  getChange: (id: string) => api.get<{ roster_change: RosterChangeRequest }>(`/rosters/changes/${id}`),
  createChange: (payload: RosterChangePayload) => api.post<{ roster_change: RosterChangeRequest }>("/rosters/changes", payload),
  submitChange: (id: string) => api.post<{ roster_change: RosterChangeRequest; already_submitted?: boolean }>(`/rosters/changes/${id}/submit`, {}),
  approveChange: (id: string, payload: { reason: string }) => api.post<{ roster_change: RosterChangeRequest }>(`/rosters/changes/${id}/approve`, payload),
  rejectChange: (id: string, payload: { reason: string }) => api.post<{ roster_change: RosterChangeRequest }>(`/rosters/changes/${id}/reject`, payload),
  cancelChange: (id: string, payload: { reason: string }) => api.post<{ roster_change: RosterChangeRequest }>(`/rosters/changes/${id}/cancel`, payload),
  changeTimeline: (id: string) => api.get<RosterChangeTimeline>(`/rosters/changes/${id}/approval-timeline`),
};

export const shiftTemplatesApi = {
  list: (filters: { outlet_id?: string; department_id?: string; status?: string; search?: string; page?: number; page_size?: number } = {}) =>
    api.get<ShiftTemplate[]>(`/shift-templates${buildQueryString(filters)}`),
  create: (payload: ShiftTemplatePayload) => api.post<{ shift_template: ShiftTemplate }>("/shift-templates", payload),
  update: (id: string, payload: Partial<ShiftTemplatePayload> & { reason?: string }) =>
    api.patch<{ shift_template: ShiftTemplate }>(`/shift-templates/${id}`, payload),
  enable: (id: string, reason: string) => api.post<{ shift_template: ShiftTemplate }>(`/shift-templates/${id}/enable`, { reason }),
  disable: (id: string, reason: string) => api.post<{ shift_template: ShiftTemplate }>(`/shift-templates/${id}/disable`, { reason }),
};
