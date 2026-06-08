ALTER TABLE attendance_daily_summary ADD COLUMN expected_start TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN expected_end TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN classification TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN absence_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN is_paid_leave INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN is_unpaid_leave INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN is_holiday INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN is_rest_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN is_incomplete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_daily_summary ADD COLUMN warnings_json TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN source_references_json TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN calculated_at TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN recalculated_by TEXT;
ALTER TABLE attendance_daily_summary ADD COLUMN correction_applied_id TEXT;

ALTER TABLE attendance_conflicts ADD COLUMN attendance_date TEXT;
ALTER TABLE attendance_conflicts ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning';
ALTER TABLE attendance_conflicts ADD COLUMN message TEXT;
ALTER TABLE attendance_conflicts ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_summary_company_classification
  ON attendance_daily_summary(company_id, classification);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_company_payroll_status
  ON attendance_daily_summary(company_id, payroll_status);

CREATE INDEX IF NOT EXISTS idx_attendance_conflicts_company_date_status
  ON attendance_conflicts(company_id, attendance_date, status);

CREATE INDEX IF NOT EXISTS idx_attendance_conflicts_company_employee_date
  ON attendance_conflicts(company_id, employee_id, attendance_date);
