import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { RosterMatrixChangePayload, RosterMatrixValidationResult, RosterWeeklyMatrixFilters, RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";

export const rosterWeeklyMatrixApi = {
  get: (filters: RosterWeeklyMatrixFilters = {}) =>
    api.get<RosterWeeklyMatrixResponse>(`/rosters/weekly-matrix${buildQueryString(filters)}`),
  employees: (filters: RosterWeeklyMatrixFilters = {}) =>
    api.get<Array<{ id: string; employee_no: string | null; name: string; department_name: string | null; position_name: string | null; level: number | null }>>(`/rosters/weekly-matrix/employees${buildQueryString(filters)}`),
  shifts: (filters: RosterWeeklyMatrixFilters = {}) =>
    api.get<RosterWeeklyMatrixResponse["shifts"]>(`/rosters/weekly-matrix/shifts${buildQueryString(filters)}`),
  validate: (payload: RosterMatrixChangePayload) =>
    api.post<RosterMatrixValidationResult>("/rosters/weekly-matrix/validate", payload),
  saveDraft: (payload: RosterMatrixChangePayload) =>
    api.post<{ saved_count: number; validation: RosterMatrixValidationResult }>("/rosters/weekly-matrix/save-draft", payload),
  submit: (payload: RosterMatrixChangePayload) =>
    api.post<{ submitted_count: number; validation: RosterMatrixValidationResult }>("/rosters/weekly-matrix/submit", payload),
  apply: (payload: RosterMatrixChangePayload) =>
    api.post<{ applied: boolean; manual_review_required: boolean; message: string; validation: RosterMatrixValidationResult }>("/rosters/weekly-matrix/apply", payload),
  copyPreviousWeek: (payload: RosterMatrixChangePayload) =>
    api.post<{ proposed_changes: RosterMatrixChangePayload["changes"]; previous_week: { start_date: string; end_date: string } }>("/rosters/weekly-matrix/copy-previous-week", payload),
  bulkAssign: (payload: RosterMatrixChangePayload) =>
    api.post<RosterMatrixValidationResult>("/rosters/weekly-matrix/bulk-assign", payload),
};
