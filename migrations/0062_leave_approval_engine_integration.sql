-- Link leave requests to the reusable approval workflow engine.
-- These fields are additive snapshots only; approval_request_id remains the
-- authoritative link to the generated approval_requests row.

ALTER TABLE leave_requests ADD COLUMN approval_current_step TEXT;
ALTER TABLE leave_requests ADD COLUMN approval_submitted_at TEXT;
ALTER TABLE leave_requests ADD COLUMN approval_completed_at TEXT;
ALTER TABLE leave_requests ADD COLUMN department_approved_at TEXT;
ALTER TABLE leave_requests ADD COLUMN department_approved_by TEXT;
ALTER TABLE leave_requests ADD COLUMN hr_approved_at TEXT;
ALTER TABLE leave_requests ADD COLUMN hr_approved_by TEXT;
ALTER TABLE leave_requests ADD COLUMN rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_approval_request
  ON leave_requests(company_id, approval_request_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_approval_current_step
  ON leave_requests(company_id, approval_current_step);
