CREATE TABLE IF NOT EXISTS employee_contracts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  contract_number TEXT,
  contract_type TEXT NOT NULL,
  contract_status TEXT NOT NULL DEFAULT 'draft',
  start_date TEXT NOT NULL,
  end_date TEXT,
  signed_date TEXT,
  probation_end_date TEXT,
  renewal_of_contract_id TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  document_id TEXT,
  salary_snapshot_amount INTEGER,
  currency TEXT DEFAULT 'MVR',
  position_id TEXT,
  department_id TEXT,
  outlet_id TEXT,
  notes TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT,
  UNIQUE(company_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_employee_start
  ON employee_contracts(company_id, employee_id, start_date);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_employee_end
  ON employee_contracts(company_id, employee_id, end_date);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_status
  ON employee_contracts(company_id, contract_status);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_end
  ON employee_contracts(company_id, end_date);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_document
  ON employee_contracts(company_id, document_id);

INSERT OR IGNORE INTO company_settings (
  id, company_id, setting_key, setting_group, setting_value_json,
  effective_from, created_by, updated_by, created_at, updated_at
) VALUES (
  'setting_documents_contract_rules',
  'company_seed_default',
  'documents.contract_rules',
  'documents',
  '{"contract_tracking_enabled":true,"contract_expiry_warning_days":60,"contract_document_required":false,"require_contract_for_foreign_employees":false,"require_contract_for_all_employees":false,"allow_multiple_active_contracts":false,"contract_renewal_approval_enabled":false}',
  NULL,
  NULL,
  NULL,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

INSERT OR IGNORE INTO document_categories (
  id, company_id, category_key, category_name, is_sensitive,
  requires_expiry_date, applies_to_foreign_employee, applies_to_local_employee,
  status, created_at, updated_at
) VALUES
('doc_cat_employment_contract', 'company_seed_default', 'employment_contract', 'Employment Contract', 1, 0, 1, 1, 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('doc_cat_contract_renewal', 'company_seed_default', 'contract_renewal', 'Contract Renewal', 1, 0, 1, 1, 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('doc_cat_contract_amendment', 'company_seed_default', 'contract_amendment', 'Contract Amendment', 1, 0, 1, 1, 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
