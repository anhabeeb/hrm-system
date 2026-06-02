import type { Pagination } from "@/types/api";

export type DepartmentStatus = "active" | "inactive" | "disabled";

export interface Department {
  id: string;
  name: string;
  code?: string | null;
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
  status?: DepartmentStatus;
}

export interface PaginatedDepartments {
  data: Department[];
  pagination?: Pagination;
}
