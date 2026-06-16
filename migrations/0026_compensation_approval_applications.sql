-- Phase 5D hardening: immutable compensation approval application mappings.
-- Forward-only migration. Do not drop or recreate compensation, salary, approval, or payroll tables.

CREATE TABLE IF NOT EXISTS compensation_approval_applications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'change', 'end')),
  applied_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (component_id) REFERENCES employee_compensation_components(id),
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compensation_approval_applications_request_unique
  ON compensation_approval_applications(company_id, approval_request_id);

CREATE INDEX IF NOT EXISTS idx_compensation_approval_applications_component
  ON compensation_approval_applications(company_id, component_id, applied_at);

CREATE INDEX IF NOT EXISTS idx_compensation_approval_applications_employee
  ON compensation_approval_applications(company_id, employee_id, applied_at);

-- Safe backfill for existing compensation rows whose approval payload clearly identifies the action.
INSERT OR IGNORE INTO compensation_approval_applications (
  id, company_id, approval_request_id, employee_id, component_id, action_type, applied_at, created_at
)
SELECT
  'comp_app_' || lower(hex(randomblob(16))),
  c.company_id,
  c.approval_request_id,
  c.employee_id,
  c.id,
  CASE json_extract(ar.payload_json, '$.approval_action')
    WHEN 'compensation_component_create' THEN 'create'
    WHEN 'compensation_component_change' THEN 'change'
    WHEN 'compensation_component_end' THEN 'end'
  END AS action_type,
  COALESCE(ar.applied_at, c.updated_at, c.created_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM employee_compensation_components c
JOIN approval_requests ar
  ON ar.company_id = c.company_id
 AND ar.id = c.approval_request_id
WHERE c.approval_request_id IS NOT NULL
  AND json_extract(ar.payload_json, '$.approval_action') IN (
    'compensation_component_create',
    'compensation_component_change',
    'compensation_component_end'
  );

-- Pre-deploy duplicate check for production:
-- SELECT company_id, approval_request_id, COUNT(*) AS count
-- FROM compensation_approval_applications
-- GROUP BY company_id, approval_request_id
-- HAVING COUNT(*) > 1;

-- Backfill review query for skipped legacy compensation approval rows:
-- SELECT c.company_id, c.id AS component_id, c.approval_request_id
-- FROM employee_compensation_components c
-- LEFT JOIN compensation_approval_applications a
--   ON a.company_id = c.company_id AND a.approval_request_id = c.approval_request_id
-- WHERE c.approval_request_id IS NOT NULL AND a.id IS NULL;
