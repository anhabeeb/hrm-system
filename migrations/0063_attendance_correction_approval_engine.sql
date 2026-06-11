ALTER TABLE attendance_corrections ADD COLUMN approval_request_id TEXT;
ALTER TABLE attendance_corrections ADD COLUMN approval_status TEXT;
ALTER TABLE attendance_corrections ADD COLUMN approval_current_step TEXT;
ALTER TABLE attendance_corrections ADD COLUMN requested_date TEXT;
ALTER TABLE attendance_corrections ADD COLUMN outlet_id TEXT;
ALTER TABLE attendance_corrections ADD COLUMN department_approved_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN department_approved_by TEXT;
ALTER TABLE attendance_corrections ADD COLUMN hr_approved_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN hr_approved_by TEXT;
ALTER TABLE attendance_corrections ADD COLUMN rejected_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN rejected_by TEXT;
ALTER TABLE attendance_corrections ADD COLUMN rejection_reason TEXT;
ALTER TABLE attendance_corrections ADD COLUMN cancelled_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN cancelled_by TEXT;
ALTER TABLE attendance_corrections ADD COLUMN cancellation_reason TEXT;
ALTER TABLE attendance_corrections ADD COLUMN approval_submitted_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN approval_completed_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN applied_at TEXT;
ALTER TABLE attendance_corrections ADD COLUMN applied_by TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_company_approval_request
  ON attendance_corrections(company_id, approval_request_id);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_company_approval_status
  ON attendance_corrections(company_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_company_requested_date
  ON attendance_corrections(company_id, requested_date);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_company_outlet
  ON attendance_corrections(company_id, outlet_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_corrections_active_approval_request
  ON attendance_corrections(company_id, approval_request_id)
  WHERE approval_request_id IS NOT NULL;
