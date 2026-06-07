-- Phase 5D hardening: compensation concurrency and approval idempotency.
-- Forward-only migration. Do not drop or recreate compensation, salary, approval, or payroll tables.

ALTER TABLE employee_compensation_components
ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_comp_components_approval_request_unique
  ON employee_compensation_components(company_id, approval_request_id)
  WHERE approval_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_timeline_guard_definition
  ON employee_compensation_components(company_id, employee_id, component_definition_id, effective_from, effective_to, status, revision);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_timeline_guard_code
  ON employee_compensation_components(company_id, employee_id, component_type, component_code, effective_from, effective_to, status, revision);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_timeline_guard_name
  ON employee_compensation_components(company_id, employee_id, component_type, component_name, effective_from, effective_to, status, revision);

-- Pre-deploy duplicate check for production:
-- SELECT company_id, approval_request_id, COUNT(*) AS duplicates
-- FROM employee_compensation_components
-- WHERE approval_request_id IS NOT NULL
-- GROUP BY company_id, approval_request_id
-- HAVING COUNT(*) > 1;
