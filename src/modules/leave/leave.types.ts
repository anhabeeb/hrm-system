import type { PaginationMeta } from "../../types/api.types";

export interface LeaveOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface LeaveTypeRecord {
  id: string;
  company_id: string;
  leave_key: string;
  leave_name: string;
  is_statutory: number;
  is_enabled: number;
  is_paid: number;
  default_days: number | null;
  requires_attachment: number;
  affects_payroll: number;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicyRecord {
  id: string;
  company_id: string;
  policy_name: string;
  employee_type: string | null;
  leave_type_id: string;
  entitlement_days: number;
  carry_forward_days: number | null;
  allow_negative_balance: number;
  max_continuous_days: number | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  accrued_days: number;
  used_days: number;
  remaining_days: number;
  updated_at: string;
}

export interface LeaveRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  created_by: string | null;
  approval_request_id: string | null;
  affects_payroll: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveEmployeeRecord {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  employment_status: string;
  deleted_at: string | null;
}

export interface LeaveListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface LeaveTypeFilters {
  is_enabled?: string;
  is_statutory?: string;
  is_paid?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface LeavePolicyFilters {
  employee_type?: string;
  leave_type_id?: string;
  status?: string;
  effective_from?: string;
  page: number;
  page_size: number;
}

export interface LeaveBalanceFilters {
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  leave_type_id?: string;
  year?: number;
  page: number;
  page_size: number;
}

export interface LeaveRequestFilters {
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  leave_type_id?: string;
  date_from?: string;
  date_to?: string;
  employee_type?: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
}

export interface LeaveCalendarFilters {
  date_from?: string;
  date_to?: string;
  outlet_id?: string;
  employee_id?: string;
  leave_type_id?: string;
  status?: string;
}

export interface LeaveTypeUpdateInput {
  is_enabled?: boolean;
  default_days?: number | null;
  requires_attachment?: boolean;
  affects_payroll?: boolean;
  reason: string;
}

export interface LeavePolicyInput {
  policy_name: string;
  employee_type?: string | null;
  leave_type_id: string;
  entitlement_days: number;
  carry_forward_days?: number;
  allow_negative_balance?: boolean;
  max_continuous_days?: number | null;
  effective_from: string;
  effective_to?: string | null;
  status?: string;
  reason: string;
}

export type LeavePolicyUpdateInput = Partial<Omit<LeavePolicyInput, "reason">> & {
  reason: string;
};

export interface LeaveBalanceAdjustInput {
  leave_type_id: string;
  year: number;
  adjustment_days: number;
  reason: string;
}

export interface LeaveRequestInput {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
}

export type LeaveRequestUpdateInput = Partial<LeaveRequestInput> & {
  reason?: string | null;
};

export interface LeaveActionInput {
  reason: string;
}
