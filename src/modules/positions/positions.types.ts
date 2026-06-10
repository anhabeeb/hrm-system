import type { POSITION_SORT_FIELDS, POSITION_STATUSES } from "./positions.constants";

export type PositionStatus = (typeof POSITION_STATUSES)[number];
export type PositionSortField = (typeof POSITION_SORT_FIELDS)[number];

export interface PositionRecord {
  id: string;
  company_id: string;
  department_id: string | null;
  department_name?: string | null;
  title: string;
  code: string | null;
  description?: string | null;
  level: number;
  default_role_id?: string | null;
  default_role_name?: string | null;
  can_manage_lower_levels?: number;
  can_act_as_department_approver?: number;
  default_salary_amount: number | null;
  is_active?: number;
  archived_at?: string | null;
  status: PositionStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PositionFilters {
  search?: string;
  department_id?: string;
  level?: number;
  status?: PositionStatus;
  page: number;
  page_size: number;
  sort_by: PositionSortField;
  sort_direction: "asc" | "desc";
}

export interface PositionWriteInput {
  title: string;
  department_id: string;
  code?: string | null;
  description?: string | null;
  level?: number;
  default_role_id?: string | null;
  can_manage_lower_levels?: boolean | number;
  can_act_as_department_approver?: boolean | number;
  default_salary_amount?: number | null;
  status?: PositionStatus;
  archived_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}
