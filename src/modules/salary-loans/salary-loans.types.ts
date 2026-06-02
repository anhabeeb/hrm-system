import type { PaginationMeta } from "../../types/api.types";

export interface SalaryLoanInput {
  employee_id: string;
  loan_amount: number;
  installment_amount: number;
  start_month: string;
  reason: string;
}
export type SalaryLoanUpdateInput = Partial<SalaryLoanInput> & { reason: string };
export interface SalaryLoanActionInput { reason: string }
export interface SalaryLoanFilters {
  employee_id?: string;
  outlet_id?: string;
  status?: string;
  start_month?: string;
  page: number;
  page_size: number;
}
export interface SalaryLoanListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
