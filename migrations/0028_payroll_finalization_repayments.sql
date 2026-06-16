-- Phase 6B: payroll approval/finalization and safe repayment application.
-- Forward-only migration. Do not drop or recreate payroll, advance, loan, or payslip history.

ALTER TABLE payroll_runs
  ADD COLUMN approval_request_id TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN submitted_for_approval_by TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN submitted_for_approval_at TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN finalized_by TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN finalized_at TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN finalization_started_at TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN finalization_failed_reason TEXT;

ALTER TABLE advance_payments
  ADD COLUMN repaid_amount INTEGER NOT NULL DEFAULT 0;

ALTER TABLE advance_payments
  ADD COLUMN repaid_at TEXT;

ALTER TABLE salary_loan_installments
  ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;

ALTER TABLE salary_loan_installments
  ADD COLUMN paid_at TEXT;

ALTER TABLE payslips
  ADD COLUMN snapshot_json TEXT;

ALTER TABLE payslips
  ADD COLUMN calculation_version INTEGER;

ALTER TABLE payslips
  ADD COLUMN finalized_at TEXT;

CREATE TABLE IF NOT EXISTS payroll_repayment_applications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_item_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  applied_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MVR',
  applied_at TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, payroll_run_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_repayment_applications_run
  ON payroll_repayment_applications(company_id, payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_payroll_repayment_applications_employee
  ON payroll_repayment_applications(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_finalization
  ON payroll_runs(company_id, status, finalized_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_company_item_unique
  ON payslips(company_id, payroll_item_id);
