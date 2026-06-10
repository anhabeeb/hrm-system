import type { Pagination } from "@/types/api";

export type PositionStatus = "active" | "inactive" | "disabled";

export interface Position {
  id: string;
  title: string;
  code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  description?: string | null;
  level: number;
  default_role_id?: string | null;
  default_role_name?: string | null;
  can_manage_lower_levels?: number | boolean | null;
  can_act_as_department_approver?: number | boolean | null;
  default_salary_amount?: number | null;
  is_active?: number | boolean | null;
  archived_at?: string | null;
  status: PositionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface PositionFilters {
  search?: string;
  department_id?: string;
  level?: number;
  status?: PositionStatus;
  page?: number;
  page_size?: number;
}

export interface PositionPayload {
  title: string;
  department_id: string;
  code?: string | null;
  description?: string | null;
  level: number;
  default_role_id?: string | null;
  can_manage_lower_levels?: boolean;
  can_act_as_department_approver?: boolean;
  default_salary_amount?: number | null;
  status?: PositionStatus;
}

export interface PaginatedPositions {
  data: Position[];
  pagination?: Pagination;
}
