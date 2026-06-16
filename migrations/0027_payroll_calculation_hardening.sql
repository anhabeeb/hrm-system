-- Phase 6A: payroll calculation hardening and traceability.
-- Forward-only migration. Do not drop or recreate payroll, salary, compensation, advance, or loan history.

ALTER TABLE payroll_runs
  ADD COLUMN payroll_year INTEGER;

ALTER TABLE payroll_runs
  ADD COLUMN payroll_month_number INTEGER;

ALTER TABLE payroll_runs
  ADD COLUMN period_start TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN period_end TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN payment_date TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'MVR';

ALTER TABLE payroll_runs
  ADD COLUMN calculation_status TEXT NOT NULL DEFAULT 'not_calculated';

ALTER TABLE payroll_runs
  ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payroll_runs
  ADD COLUMN calculation_started_at TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN calculated_at TEXT;

ALTER TABLE payroll_runs
  ADD COLUMN calculation_settings_json TEXT;

ALTER TABLE payroll_items
  ADD COLUMN source_type TEXT;

ALTER TABLE payroll_items
  ADD COLUMN source_id TEXT;

ALTER TABLE payroll_items
  ADD COLUMN calculation_code TEXT;

ALTER TABLE payroll_items
  ADD COLUMN calculation_description TEXT;

ALTER TABLE payroll_items
  ADD COLUMN calculation_metadata_json TEXT;

ALTER TABLE payroll_items
  ADD COLUMN generated_by_calculation INTEGER NOT NULL DEFAULT 1;

ALTER TABLE payroll_items
  ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payroll_earnings
  ADD COLUMN source_reference TEXT;

ALTER TABLE payroll_earnings
  ADD COLUMN calculation_code TEXT;

ALTER TABLE payroll_earnings
  ADD COLUMN calculation_description TEXT;

ALTER TABLE payroll_earnings
  ADD COLUMN calculation_metadata_json TEXT;

ALTER TABLE payroll_earnings
  ADD COLUMN generated_by_calculation INTEGER NOT NULL DEFAULT 1;

ALTER TABLE payroll_earnings
  ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payroll_deductions
  ADD COLUMN source_reference TEXT;

ALTER TABLE payroll_deductions
  ADD COLUMN calculation_code TEXT;

ALTER TABLE payroll_deductions
  ADD COLUMN calculation_description TEXT;

ALTER TABLE payroll_deductions
  ADD COLUMN calculation_metadata_json TEXT;

ALTER TABLE payroll_deductions
  ADD COLUMN generated_by_calculation INTEGER NOT NULL DEFAULT 1;

ALTER TABLE payroll_deductions
  ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_year_month
  ON payroll_runs(company_id, payroll_year, payroll_month_number);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run_generated
  ON payroll_items(company_id, payroll_run_id, generated_by_calculation);
