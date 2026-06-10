import type { DEPARTMENT_SORT_FIELDS, DEPARTMENT_STATUSES } from "./departments.constants";

export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];
export type DepartmentSortField = (typeof DEPARTMENT_SORT_FIELDS)[number];

export interface DepartmentRecord {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  description?: string | null;
  head_employee_id?: string | null;
  head_employee_name?: string | null;
  day_to_day_management_min_level?: number;
  is_active?: number;
  archived_at?: string | null;
  employee_count?: number;
  position_count?: number;
  status: DepartmentStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by?: string | null;
  updated_by?: string | null;
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
  description?: string | null;
  head_employee_id?: string | null;
  day_to_day_management_min_level?: number;
  status?: DepartmentStatus;
  archived_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}
