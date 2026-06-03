import type { PaginationMeta } from "../../types/api.types";

export interface PayslipGenerateInput {
  payroll_run_id: string;
  outlet_id?: string;
  reason: string;
}
export interface PayslipFilters {
  payroll_run_id?: string;
  payroll_month?: string;
  employee_id?: string;
  outlet_id?: string;
  status?: string;
  page: number;
  page_size: number;
}
export interface PayslipListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
