import type { Pagination } from "@/types/api";

export type DepartmentStatus = "active" | "inactive" | "disabled";

export interface Department {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  head_employee_id?: string | null;
  head_employee_name?: string | null;
  day_to_day_management_min_level?: number | null;
  is_active?: number | boolean | null;
  archived_at?: string | null;
  employee_count?: number | null;
  position_count?: number | null;
  status: DepartmentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface DepartmentFilters {
  search?: string;
  status?: DepartmentStatus;
  page?: number;
  page_size?: number;
}

export interface DepartmentPayload {
  name: string;
  code?: string | null;
  description?: string | null;
  head_employee_id?: string | null;
  day_to_day_management_min_level?: number;
  status?: DepartmentStatus;
}

export interface PaginatedDepartments {
  data: Department[];
  pagination?: Pagination;
}
