import type { POSITION_SORT_FIELDS, POSITION_STATUSES } from "./positions.constants";

export type PositionStatus = (typeof POSITION_STATUSES)[number];
export type PositionSortField = (typeof POSITION_SORT_FIELDS)[number];

export interface PositionRecord {
  id: string;
  company_id: string;
  department_id: string | null;
  title: string;
  code: string | null;
  default_salary_amount: number | null;
  status: PositionStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PositionFilters {
  search?: string;
  department_id?: string;
  status?: PositionStatus;
  page: number;
  page_size: number;
  sort_by: PositionSortField;
  sort_direction: "asc" | "desc";
}

export interface PositionWriteInput {
  title: string;
  department_id?: string | null;
  code?: string | null;
  default_salary_amount?: number | null;
  status?: PositionStatus;
}
