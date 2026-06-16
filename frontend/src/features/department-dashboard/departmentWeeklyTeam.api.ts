import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { DepartmentWeeklyTeamDepartmentOption, DepartmentWeeklyTeamFilters, DepartmentWeeklyTeamResponse } from "./departmentWeeklyTeam.types";

export const departmentWeeklyTeamApi = {
  departments: () =>
    api.get<DepartmentWeeklyTeamDepartmentOption[]>("/departments/weekly-team-departments"),
  selfDepartments: () =>
    api.get<DepartmentWeeklyTeamDepartmentOption[]>("/self/department-dashboard/weekly-team-departments"),
  admin: (filters: DepartmentWeeklyTeamFilters) =>
    api.get<DepartmentWeeklyTeamResponse>(`/departments/weekly-team-view${buildQueryString(filters)}`),
  self: (filters: DepartmentWeeklyTeamFilters) =>
    api.get<DepartmentWeeklyTeamResponse>(`/self/department-dashboard/weekly-team-view${buildQueryString(filters)}`),
};
