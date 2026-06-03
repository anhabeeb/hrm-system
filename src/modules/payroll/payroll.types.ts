import type { PaginationMeta } from "../../types/api.types";

export interface PayrollOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface PayrollRunRecord {
  id: string;
  company_id: string;
  payroll_month: string;
  status: string;
  calculation_basis: string;
  total_gross_amount: number;
  total_deduction_amount: number;
  total_net_amount: number;
  calculated_by: string | null;
  approved_by: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollItemRecord {
  id: string;
  company_id: string;
  payroll_run_id: string;
  employee_id: string;
  outlet_id: string | null;
  basic_salary_amount: number;
  payable_basic_amount: number;
  gross_amount: number;
  total_deductions_amount: number;
  net_amount: number;
  carry_forward_deduction_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  employment_status: string;
  joined_at: string | null;
  resigned_at: string | null;
  terminated_at: string | null;
  deleted_at: string | null;
}

export interface PayrollListFilters {
  payroll_month?: string;
  status?: string;
  outlet_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
}

export interface PayrollItemFilters {
  employee_id?: string;
  outlet_id?: string;
  status?: string;
  page: number;
  page_size: number;
}

export interface PayrollExceptionFilters {
  severity?: string;
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  exception_type?: string;
  page: number;
  page_size: number;
}

export interface PayrollCalculateInput {
  payroll_month: string;
  outlet_id?: string;
  employee_ids?: string[];
  reason?: string;
}

export interface PayrollActionInput {
  reason: string;
}

export interface PayrollExceptionResolveInput {
  reason: string;
  resolution_notes?: string;
}

export interface PayrollListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface PayrollCalculationSettings {
  salaryBasis: string;
  customSalaryDays?: number;
  deductAbsentDays: boolean;
  deductLateMinutes: boolean;
  deductEarlyCheckout: boolean;
  allowNegativeSalary: boolean;
  carryForwardUnpaidDeductions: boolean;
}

export interface PayrollCalculationResult {
  item: PayrollItemRecord;
  earnings: Array<{ earning_type: string; amount: number; source_type?: string | null; source_id?: string | null; notes?: string | null }>;
  deductions: Array<{ deduction_type: string; amount: number; source_type?: string | null; source_id?: string | null; notes?: string | null }>;
  exceptions: Array<{ exception_type: string; severity: string; message: string; employee_id?: string; outlet_id?: string | null }>;
}
