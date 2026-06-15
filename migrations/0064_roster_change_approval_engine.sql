-- Roster change approval engine integration.
-- Additive only: existing roster shifts are not modified or migrated.

CREATE TABLE IF NOT EXISTS roster_change_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  outlet_id TEXT,
  store_id TEXT,
  roster_id TEXT,
  shift_id TEXT,
  source_roster_id TEXT,
  target_roster_id TEXT,
  source_shift_id TEXT,
  target_shift_id TEXT,
  change_type TEXT NOT NULL,
  requested_date TEXT,
  requested_start_at TEXT,
  requested_end_at TEXT,
  requested_break_start TEXT,
  requested_break_end TEXT,
  current_value_json TEXT,
  requested_value_json TEXT,
  reason TEXT NOT NULL,
  employee_note TEXT,
  manager_note TEXT,
  hr_note TEXT,
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  department_approved_at TEXT,
  department_approved_by TEXT,
  hr_approved_at TEXT,
  hr_approved_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (status IN (
    'DRAFT',
    'PENDING',
    'PENDING_DEPARTMENT_APPROVAL',
    'PENDING_HR_APPROVAL',
    'PENDING_MANUAL_REVIEW',
    'APPROVED',
    'APPLIED',
    'REJECTED',
    'CANCELLED',
    'FAILED_TO_APPLY'
  ))
);

CREATE INDEX IF NOT EXISTS idx_roster_change_requests_company ON roster_change_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_employee ON roster_change_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_requester_employee ON roster_change_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_approval ON roster_change_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_status ON roster_change_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_approval_status ON roster_change_requests(company_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_requested_date ON roster_change_requests(company_id, requested_date);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_department ON roster_change_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_outlet ON roster_change_requests(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_roster ON roster_change_requests(company_id, roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_change_requests_shift ON roster_change_requests(company_id, shift_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_change_requests_one_active_approval
ON roster_change_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_change_requests_no_duplicate_pending
ON roster_change_requests(company_id, employee_id, requested_date, change_type, COALESCE(shift_id, ''), COALESCE(roster_id, ''))
WHERE status IN ('DRAFT', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW');
