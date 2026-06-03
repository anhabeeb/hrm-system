import type { PaginationMeta } from "../../types/api.types";

export interface UniformOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface UniformFilters {
  employee_id?: string;
  outlet_id?: string;
  uniform_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface UniformIssueInput {
  employee_id: string;
  outlet_id?: string;
  uniform_type: string;
  quantity: number;
  issued_date: string;
  reason?: string;
}

export interface UniformReturnInput {
  returned_date: string;
  reason: string;
}

export interface UniformListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
