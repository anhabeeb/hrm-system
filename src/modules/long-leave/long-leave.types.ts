import type { PaginationMeta } from "../../types/api.types";

export interface LongLeaveOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface LongLeaveRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_request_id: string;
  start_date: string;
  expected_return_date: string;
  actual_return_date: string | null;
  total_days: number;
  status: string;
  salary_impact_confirmed: number;
  created_at: string;
  updated_at: string;
}

export interface LongLeaveImpactRecord {
  id: string;
  company_id: string;
  employee_id: string;
  long_leave_record_id: string;
  payroll_month: string;
  monthly_salary_amount: number;
  salary_calculation_days: number;
  worked_days: number;
  long_leave_days: number;
  daily_salary_amount: number;
  estimated_payable_amount: number;
  final_payable_amount: number | null;
  override_amount: number | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LongLeaveEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  employment_status: string;
  deleted_at: string | null;
}

export interface LongLeaveFilters {
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface LongLeaveListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface LongLeaveCreateInput {
  employee_id: string;
  leave_request_id: string;
  start_date: string;
  expected_return_date: string;
  reason: string;
  allow_short_leave_override?: boolean;
}

export interface LongLeaveActionInput {
  reason: string;
}

export interface LongLeaveReturnInput {
  actual_return_date: string;
  reason: string;
}

export interface LongLeaveOverrideInput {
  payroll_month: string;
  override_amount: number;
  reason: string;
}

export interface SalaryImpactCalculationRow {
  payroll_month: string;
  monthly_salary_amount: number;
  salary_calculation_days: number;
  worked_days: number;
  long_leave_days: number;
  daily_salary_amount: number;
  estimated_payable_amount: number;
}
