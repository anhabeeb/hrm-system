-- Phase 6C: immutable payslip snapshot hardening.
-- Forward-only migration. Do not drop or recreate payslip/payroll data.

ALTER TABLE payslips
  ADD COLUMN employee_snapshot_json TEXT;

ALTER TABLE payslips
  ADD COLUMN company_snapshot_json TEXT;

ALTER TABLE payslips
  ADD COLUMN period_snapshot_json TEXT;

ALTER TABLE payslips
  ADD COLUMN earnings_json TEXT;

ALTER TABLE payslips
  ADD COLUMN deductions_json TEXT;

ALTER TABLE payslips
  ADD COLUMN non_cash_benefits_json TEXT;

ALTER TABLE payslips
  ADD COLUMN totals_json TEXT;

ALTER TABLE payslips
  ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payslips
  ADD COLUMN last_downloaded_at TEXT;

ALTER TABLE payslips
  ADD COLUMN printed_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payslips
  ADD COLUMN last_printed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_company_run_employee_unique
  ON payslips(company_id, payroll_run_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payslips_employee_month
  ON payslips(company_id, employee_id, payroll_run_id, status);
