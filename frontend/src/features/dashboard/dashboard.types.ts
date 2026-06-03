export interface PayrollStatusSummary {
  payroll_month?: string;
  status?: string;
}

export interface DashboardSummary {
  total_active_employees?: number;
  employees_on_leave_today?: number;
  checked_in_today?: number;
  missing_clock_out_today?: number;
  pending_leave_requests?: number;
  pending_approval_requests?: number;
  pending_attendance_conflicts?: number;
  documents_expiring_soon?: number;
  missing_required_documents?: number;
  active_devices?: number;
  devices_with_warnings?: number;
  latest_payroll_status?: PayrollStatusSummary | null;
  pending_asset_returns?: number;
  pending_uniform_returns?: number;
}
