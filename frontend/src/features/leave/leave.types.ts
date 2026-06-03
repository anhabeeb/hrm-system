export interface LeaveRequest {
  id: string;
  employee_id?: string;
  employee_code?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  leave_type_id?: string;
  leave_type_name?: string;
  start_date?: string;
  end_date?: string;
  total_days?: number;
  status: string;
  reason?: string | null;
  requested_by?: string | null;
  requested_by_name?: string | null;
  approval_request_id?: string | null;
  created_at?: string;
}

export interface LeaveBalance {
  id?: string;
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  leave_type_id: string;
  leave_type_name?: string;
  year: number;
  opening_balance?: number;
  accrued_days?: number;
  used_days?: number;
  pending_days?: number;
  remaining_days?: number;
}

export interface LeaveType {
  id: string;
  name?: string;
  leave_type_name?: string;
  code?: string;
  default_days?: number | null;
  is_enabled?: boolean | number;
  is_statutory?: boolean | number;
  is_paid?: boolean | number;
  affects_payroll?: boolean | number;
  status?: string;
}

export interface LeavePolicy {
  id: string;
  policy_name?: string;
  employee_type?: string | null;
  leave_type_id?: string;
  entitlement_days?: number;
  status?: string;
  effective_from?: string;
}

export interface LeaveFilters {
  search?: string;
  outlet_id?: string;
  employee_id?: string;
  leave_type_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  employee_type?: string;
  department_id?: string;
  year?: number;
  page?: number;
  page_size?: number;
}

export interface LeaveRequestPayload {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface LeaveBalanceAdjustPayload {
  leave_type_id: string;
  year: number;
  adjustment_days: number;
  reason: string;
}
