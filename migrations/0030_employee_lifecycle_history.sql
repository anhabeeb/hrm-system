ALTER TABLE employee_status_history ADD COLUMN effective_from TEXT;
ALTER TABLE employee_status_history ADD COLUMN effective_to TEXT;
ALTER TABLE employee_status_history ADD COLUMN notes TEXT;
ALTER TABLE employee_status_history ADD COLUMN approval_request_id TEXT;
ALTER TABLE employee_status_history ADD COLUMN approved_by TEXT;
ALTER TABLE employee_status_history ADD COLUMN created_by TEXT;
ALTER TABLE employee_status_history ADD COLUMN updated_at TEXT;

UPDATE employee_status_history
SET effective_from = COALESCE(effective_from, substr(changed_at, 1, 10)),
    created_by = COALESCE(created_by, changed_by),
    updated_at = COALESCE(updated_at, created_at)
WHERE effective_from IS NULL OR created_by IS NULL OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_status_history_employee_effective
  ON employee_status_history(company_id, employee_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_employee_status_history_employee_status
  ON employee_status_history(company_id, employee_id, new_status);

CREATE INDEX IF NOT EXISTS idx_employee_status_history_company_effective
  ON employee_status_history(company_id, effective_from);
