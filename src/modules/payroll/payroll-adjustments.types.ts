import type { PaginationMeta } from "../../types/api.types";

export const PAYROLL_ADJUSTMENT_OPERATION = "PAYROLL_ADJUSTMENT" as const;
export const PAYROLL_ADJUSTMENT_SUBJECT_TYPE = "PAYROLL_ADJUSTMENT" as const;

export const PAYROLL_ADJUSTMENT_TYPES = [
  "BASIC_SALARY_CORRECTION",
  "SALARY_INCREMENT_CORRECTION",
  "ALLOWANCE_ADJUSTMENT",
  "BENEFIT_ADJUSTMENT",
  "DEDUCTION_ADJUSTMENT",
  "ABSENCE_DEDUCTION_CORRECTION",
  "UNPAID_LEAVE_DEDUCTION_CORRECTION",
  "OVERTIME_ADJUSTMENT",
  "SERVICE_CHARGE_ADJUSTMENT",
  "BONUS_ADJUSTMENT",
  "PENALTY_ADJUSTMENT",
  "PAYROLL_COMPONENT_ADJUSTMENT",
  "PAYSLIP_CORRECTION",
  "MANUAL_ADJUSTMENT",
  "GENERAL_PAYROLL_ADJUSTMENT",
  // Backward-compatible aliases retained for legacy rows/API clients.
  "EARNING_ADJUSTMENT",
  "ATTENDANCE_DEDUCTION_REVERSAL",
  "LEAVE_DEDUCTION_REVERSAL",
  "CORRECTION_ADJUSTMENT",
  "MANUAL_PAYROLL_ADJUSTMENT",
] as const;

export const PAYROLL_ADJUSTMENT_DIRECTIONS = ["ADD", "DEDUCT", "NEUTRAL"] as const;

export const PAYROLL_ADJUSTMENT_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_EXECUTION",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "APPLIED",
  "REJECTED",
  "CANCELLED",
  "FAILED_TO_APPLY",
] as const;

export type PayrollAdjustmentType = (typeof PAYROLL_ADJUSTMENT_TYPES)[number];
export type PayrollAdjustmentDirection = (typeof PAYROLL_ADJUSTMENT_DIRECTIONS)[number];
export type PayrollAdjustmentStatus = (typeof PAYROLL_ADJUSTMENT_STATUSES)[number];

export interface PayrollAdjustmentEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string | null;
  full_name: string;
  employment_status: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface PayrollAdjustmentRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  outlet_id: string | null;
  payroll_run_id: string | null;
  payroll_item_id: string | null;
  payslip_id: string | null;
  adjustment_type: PayrollAdjustmentType;
  adjustment_direction: PayrollAdjustmentDirection;
  amount: number | null;
  currency: string | null;
  effective_payroll_month: string | null;
  reason: string;
  current_value_json: string | null;
  requested_value_json: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  status: PayrollAdjustmentStatus;
  current_step_name?: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
  outlet_name?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  owner_reviewed_at: string | null;
  owner_reviewed_by: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  applied_at: string | null;
  applied_by: string | null;
  apply_error_code: string | null;
  apply_error_message: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface PayrollAdjustmentFilters {
  employee_id?: string;
  department_id?: string;
  outlet_id?: string;
  payroll_run_id?: string;
  status?: PayrollAdjustmentStatus;
  approval_status?: string;
  effective_payroll_month?: string;
  page: number;
  page_size: number;
}

export interface PayrollAdjustmentInput {
  employee_id?: string | null;
  payroll_run_id?: string | null;
  payroll_item_id?: string | null;
  payslip_id?: string | null;
  adjustment_type: PayrollAdjustmentType;
  adjustment_direction: PayrollAdjustmentDirection;
  amount?: number | null;
  currency?: string | null;
  effective_payroll_month?: string | null;
  reason: string;
  current_value_json?: Record<string, unknown> | null;
  requested_value_json?: Record<string, unknown> | null;
}

export interface PayrollAdjustmentActionInput {
  reason: string;
  notes?: string | null;
}

export interface PayrollAdjustmentListResult {
  rows: PayrollAdjustmentRequestRecord[];
  pagination: PaginationMeta;
}
