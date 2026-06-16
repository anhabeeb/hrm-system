-- Phase 9C: Long Leave for Foreign Employees hardening.
-- Additive only: preserves existing long leave records and salary impact rows.

ALTER TABLE long_leave_records ADD COLUMN approval_status TEXT DEFAULT 'pending';
ALTER TABLE long_leave_records ADD COLUMN payroll_status TEXT DEFAULT 'not_started';
ALTER TABLE long_leave_records ADD COLUMN submitted_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN submitted_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN approved_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN approved_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN rejected_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN rejected_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN cancelled_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN cancelled_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN cancel_reason TEXT;
ALTER TABLE long_leave_records ADD COLUMN returned_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN returned_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN return_notes TEXT;
ALTER TABLE long_leave_records ADD COLUMN reason TEXT;
ALTER TABLE long_leave_records ADD COLUMN notes TEXT;
ALTER TABLE long_leave_records ADD COLUMN salary_treatment TEXT DEFAULT 'unpaid';
ALTER TABLE long_leave_records ADD COLUMN deduction_method TEXT DEFAULT 'calendar_days';
ALTER TABLE long_leave_records ADD COLUMN payable_days_policy TEXT DEFAULT 'pay_only_worked_days';
ALTER TABLE long_leave_records ADD COLUMN expected_return_date_original TEXT;
ALTER TABLE long_leave_records ADD COLUMN extended_from_long_leave_id TEXT;
ALTER TABLE long_leave_records ADD COLUMN created_by TEXT;

CREATE TABLE IF NOT EXISTS long_leave_payroll_impacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  long_leave_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  base_salary INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  long_leave_days REAL NOT NULL DEFAULT 0,
  payable_days REAL NOT NULL DEFAULT 0,
  unpaid_days REAL NOT NULL DEFAULT 0,
  per_day_rate INTEGER NOT NULL DEFAULT 0,
  deduction_amount INTEGER NOT NULL DEFAULT 0,
  payable_salary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review',
  payroll_run_id TEXT,
  payroll_adjustment_id TEXT,
  calculated_at TEXT NOT NULL,
  applied_at TEXT,
  applied_by TEXT,
  idempotency_key TEXT NOT NULL,
  notes TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, idempotency_key),
  UNIQUE(company_id, long_leave_id, payroll_month)
);

CREATE INDEX IF NOT EXISTS idx_long_leave_records_company_employee_status ON long_leave_records(company_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_long_leave_records_company_dates ON long_leave_records(company_id, start_date, expected_return_date);
CREATE INDEX IF NOT EXISTS idx_long_leave_records_company_approval ON long_leave_records(company_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_long_leave_records_company_payroll ON long_leave_records(company_id, payroll_status);
CREATE INDEX IF NOT EXISTS idx_long_leave_payroll_impacts_company_leave_month ON long_leave_payroll_impacts(company_id, long_leave_id, payroll_month);
CREATE INDEX IF NOT EXISTS idx_long_leave_payroll_impacts_company_employee_month ON long_leave_payroll_impacts(company_id, employee_id, payroll_month);

UPDATE long_leave_records
SET approval_status = CASE
    WHEN status IN ('approved', 'active', 'returned') THEN 'approved'
    WHEN status = 'rejected' THEN 'rejected'
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE COALESCE(approval_status, 'pending')
  END,
  payroll_status = CASE
    WHEN salary_impact_confirmed = 1 THEN 'pending_review'
    ELSE COALESCE(payroll_status, 'not_started')
  END,
  expected_return_date_original = COALESCE(expected_return_date_original, expected_return_date),
  created_by = COALESCE(created_by, 'system')
WHERE approval_status IS NULL OR payroll_status IS NULL OR expected_return_date_original IS NULL OR created_by IS NULL;
