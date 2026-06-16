-- Phase 13D: Performance / D1 optimization indexes.
-- Additive only. These indexes target bounded list/report paths that already
-- enforce company scope and pagination.

CREATE INDEX IF NOT EXISTS idx_perf_attendance_summary_company_date
  ON attendance_daily_summary(company_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_perf_roster_shifts_company_employee_date
  ON roster_shifts(company_id, employee_id, shift_date);

CREATE INDEX IF NOT EXISTS idx_perf_roster_shifts_company_outlet_date
  ON roster_shifts(company_id, outlet_id, shift_date);

CREATE INDEX IF NOT EXISTS idx_perf_roster_conflicts_company_status_created
  ON roster_conflicts(company_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_perf_biometric_devices_company_status_seen
  ON biometric_devices(company_id, status, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_perf_leave_requests_company_status_dates
  ON leave_requests(company_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_perf_long_leave_records_company_status_dates
  ON long_leave_records(company_id, status, start_date, expected_return_date);
