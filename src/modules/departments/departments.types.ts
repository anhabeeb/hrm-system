import type { DEPARTMENT_SORT_FIELDS, DEPARTMENT_STATUSES } from "./departments.constants";

export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];
export type DepartmentSortField = (typeof DEPARTMENT_SORT_FIELDS)[number];

export interface DepartmentRecord {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  status: DepartmentStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DepartmentFilters {
  search?: string;
  status?: DepartmentStatus;
  page: number;
  page_size: number;
  sort_by: DepartmentSortField;
  sort_direction: "asc" | "desc";
}

export interface DepartmentWriteInput {
  name: string;
  code?: string | null;
  status?: DepartmentStatus;
}
