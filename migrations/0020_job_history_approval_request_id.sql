ALTER TABLE employee_job_history
ADD COLUMN approval_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_job_history_approval_request
  ON employee_job_history(company_id, approval_request_id);
