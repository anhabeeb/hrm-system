-- Phase 11C: Payroll / Finance Reports.
-- Additive-only indexes and long-leave impact report compatibility columns.

ALTER TABLE long_leave_payroll_impacts ADD COLUMN holiday_days REAL NOT NULL DEFAULT 0;
ALTER TABLE long_leave_payroll_impacts ADD COLUMN payable_holiday_days REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payroll_reports_runs_month_status
  ON payroll_runs(company_id, payroll_month, status);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_items_run_employee
  ON payroll_items(company_id, payroll_run_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_payslips_run_employee
  ON payslips(company_id, payroll_run_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_salary_history_employee_effective
  ON employee_salary_history(company_id, employee_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_advances_employee_status
  ON advance_payments(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_loans_employee_status
  ON salary_loans(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_reports_installments_employee_month
  ON salary_loan_installments(company_id, employee_id, payroll_month);
