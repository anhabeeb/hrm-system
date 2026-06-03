import type { PaginationMeta } from "../../types/api.types";

export interface AdvanceInput {
  employee_id: string;
  amount: number;
  paid_date: string;
  deduction_month: string;
  reason: string;
}

export type AdvanceUpdateInput = Partial<AdvanceInput> & { reason: string };

export interface AdvanceFilters {
  employee_id?: string;
  outlet_id?: string;
  status?: string;
  deduction_month?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface AdvanceActionInput {
  reason: string;
}

export interface AdvanceListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
