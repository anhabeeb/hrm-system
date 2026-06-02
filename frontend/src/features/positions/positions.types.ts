import type { Pagination } from "@/types/api";

export type PositionStatus = "active" | "inactive" | "disabled";

export interface Position {
  id: string;
  title: string;
  code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  default_salary_amount?: number | null;
  status: PositionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface PositionFilters {
  search?: string;
  department_id?: string;
  status?: PositionStatus;
  page?: number;
  page_size?: number;
}

export interface PositionPayload {
  title: string;
  department_id?: string | null;
  code?: string | null;
  default_salary_amount?: number | null;
  status?: PositionStatus;
}

export interface PaginatedPositions {
  data: Position[];
  pagination?: Pagination;
}
