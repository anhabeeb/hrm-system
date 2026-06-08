-- Phase 9B: Leave approval workflow hardening.
-- Additive only. Existing leave request statuses remain valid for historical rows.

ALTER TABLE leave_requests ADD COLUMN approval_status TEXT;
ALTER TABLE leave_requests ADD COLUMN submitted_at TEXT;
ALTER TABLE leave_requests ADD COLUMN submitted_by TEXT;
ALTER TABLE leave_requests ADD COLUMN approved_at TEXT;
ALTER TABLE leave_requests ADD COLUMN approved_by TEXT;
ALTER TABLE leave_requests ADD COLUMN rejected_at TEXT;
ALTER TABLE leave_requests ADD COLUMN rejected_by TEXT;
ALTER TABLE leave_requests ADD COLUMN cancelled_at TEXT;
ALTER TABLE leave_requests ADD COLUMN cancelled_by TEXT;
ALTER TABLE leave_requests ADD COLUMN withdrawn_at TEXT;
ALTER TABLE leave_requests ADD COLUMN withdrawn_by TEXT;
ALTER TABLE leave_requests ADD COLUMN decision_reason TEXT;

UPDATE leave_requests
SET approval_status = CASE
  WHEN status IN ('approved', 'direct_approved') THEN 'approved'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'cancelled' THEN 'cancelled'
  WHEN status IN ('pending', 'submitted', 'pending_approval') THEN 'pending'
  ELSE COALESCE(approval_status, status)
END
WHERE approval_status IS NULL;

CREATE TABLE IF NOT EXISTS leave_approval_steps (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  approver_type TEXT NOT NULL,
  approver_user_id TEXT,
  approver_role_id TEXT,
  approver_role_key TEXT,
  required_permission_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_by TEXT,
  decision_at TEXT,
  decision_note TEXT,
  delegated_to TEXT,
  delegated_by TEXT,
  delegated_at TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, leave_request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_approval_status
  ON leave_requests(company_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_status_dates
  ON leave_requests(company_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_leave_balance_tx_company_leave_request
  ON leave_balance_transactions(company_id, leave_request_id);

CREATE INDEX IF NOT EXISTS idx_leave_approval_steps_company_request
  ON leave_approval_steps(company_id, leave_request_id);

CREATE INDEX IF NOT EXISTS idx_leave_approval_steps_company_user_status
  ON leave_approval_steps(company_id, approver_user_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_approval_steps_company_role_status
  ON leave_approval_steps(company_id, approver_role_key, status);
