-- Phase 11B HR Reports: additive indexes for bounded people/compliance report queries.
-- These indexes use existing columns only and do not mutate report data.

CREATE INDEX IF NOT EXISTS idx_hr_reports_employees_company_outlet_status
  ON employees(company_id, primary_outlet_id, employment_status);

CREATE INDEX IF NOT EXISTS idx_hr_reports_employees_company_department_status
  ON employees(company_id, department_id, employment_status);

CREATE INDEX IF NOT EXISTS idx_hr_reports_employees_company_position
  ON employees(company_id, position_id);

CREATE INDEX IF NOT EXISTS idx_hr_reports_employees_company_type
  ON employees(company_id, employee_type);

CREATE INDEX IF NOT EXISTS idx_hr_reports_employees_company_joined
  ON employees(company_id, joined_at);

CREATE INDEX IF NOT EXISTS idx_hr_reports_contracts_employee_end
  ON employee_contracts(company_id, employee_id, end_date);

CREATE INDEX IF NOT EXISTS idx_hr_reports_asset_assignments_employee_status
  ON asset_assignments(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_reports_uniform_issues_employee_status
  ON uniform_issues(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_reports_job_history_employee_effective
  ON employee_job_history(company_id, employee_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_hr_reports_status_history_employee_changed
  ON employee_status_history(company_id, employee_id, changed_at);
