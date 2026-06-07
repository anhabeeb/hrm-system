import type { PaginationMeta } from "../../types/api.types";

export interface PayrollOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface PayrollRunRecord {
  id: string;
  company_id: string;
  payroll_month: string;
  payroll_year?: number | null;
  payroll_month_number?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  payment_date?: string | null;
  status: string;
  calculation_basis: string;
  currency?: string | null;
  calculation_status?: string | null;
  calculation_version?: number | null;
  calculation_started_at?: string | null;
  calculated_at?: string | null;
  calculation_settings_json?: string | null;
  approval_request_id?: string | null;
  submitted_for_approval_by?: string | null;
  submitted_for_approval_at?: string | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
  finalization_started_at?: string | null;
  finalization_failed_reason?: string | null;
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
  source_type?: string | null;
  source_id?: string | null;
  calculation_code?: string | null;
  calculation_description?: string | null;
  calculation_metadata_json?: string | null;
  generated_by_calculation?: number;
  calculation_version?: number;
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
  status_effective_from?: string | null;
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
  currency?: string;
  prorateBasicSalaryForMidMonthChanges?: boolean;
  prorateRecurringComponents?: boolean;
  unpaidLeaveDeductionEnabled?: boolean;
  longLeavePayDaysWorkedOnly?: boolean;
  automaticAdvanceDeductionEnabled?: boolean;
  automaticLoanInstallmentDeductionEnabled?: boolean;
  requireCompleteAttendanceBeforeCalculation?: boolean;
  missingAttendanceCountsAsAbsent?: boolean;
  absenceDeductionRequiresExplicitAbsentStatus?: boolean;
  includeWeekendsInWorkingDays?: boolean;
  requireActiveSalaryRecord?: boolean;
  roundingMethod?: "none" | "nearest_lari" | "nearest_rufiyaa" | "round_down" | "round_up";
  negativeNetPayPolicy?: "block" | "allow" | "carry_forward_excess_deduction";
  deductAbsentDays: boolean;
  deductLateMinutes: boolean;
  deductEarlyCheckout: boolean;
  allowNegativeSalary: boolean;
  carryForwardUnpaidDeductions: boolean;
}

export interface PayrollCalculationResult {
  item: PayrollItemRecord;
  earnings: PayrollGeneratedEarning[];
  deductions: PayrollGeneratedDeduction[];
  exceptions: Array<{ exception_type: string; severity: string; message: string; employee_id?: string; outlet_id?: string | null }>;
  warnings?: Array<{ warning_type: string; message: string; metadata?: Record<string, unknown> }>;
  summary?: PayrollCalculationSummary;
}

export interface PayrollGeneratedLineBase {
  amount: number;
  source_type?: string | null;
  source_id?: string | null;
  source_reference?: string | null;
  calculation_code?: string | null;
  calculation_description?: string | null;
  calculation_metadata_json?: string | null;
  generated_by_calculation?: number;
  calculation_version?: number;
  notes?: string | null;
}

export interface PayrollGeneratedEarning extends PayrollGeneratedLineBase {
  earning_type: string;
}

export interface PayrollGeneratedDeduction extends PayrollGeneratedLineBase {
  deduction_type: string;
}

export interface PayrollSalaryHistoryRecord {
  id: string;
  monthly_salary_amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  approval_request_id?: string | null;
  change_type?: string | null;
}

export interface PayrollCompensationComponentRecord {
  id: string;
  component_definition_id: string | null;
  component_type: "allowance" | "benefit" | "deduction";
  component_code: string | null;
  component_name: string;
  amount: number;
  currency: string;
  calculation_type: "fixed_amount" | "percentage_of_basic_salary" | "non_cash_benefit";
  affects_gross_pay: number;
  affects_net_pay: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
}

export interface PayrollCalculationSummary {
  recurring_gross_additions: number;
  recurring_gross_deductions: number;
  recurring_net_additions: number;
  recurring_net_deductions: number;
  non_cash_benefits: number;
  attendance_deductions: number;
  unpaid_leave_deductions: number;
  advance_deductions: number;
  loan_deductions: number;
  other_deductions: number;
}

export interface PayrollRepaymentSource {
  payroll_run_id: string;
  payroll_item_id: string;
  employee_id: string;
  source_type: string;
  source_id: string;
  amount: number;
  item_total_deductions_amount: number;
  currency?: string | null;
}
