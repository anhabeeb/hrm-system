ALTER TABLE employee_documents ADD COLUMN document_number TEXT;
ALTER TABLE employee_documents ADD COLUMN issue_date TEXT;
ALTER TABLE employee_documents ADD COLUMN start_date TEXT;
ALTER TABLE employee_documents ADD COLUMN document_category TEXT;
ALTER TABLE employee_documents ADD COLUMN driving_license_category TEXT;
ALTER TABLE employee_documents ADD COLUMN driving_license_category_other TEXT;
ALTER TABLE employee_documents ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE employee_documents ADD COLUMN replaced_by_document_id TEXT;
ALTER TABLE employee_documents ADD COLUMN previous_document_id TEXT;
ALTER TABLE employee_documents ADD COLUMN notes TEXT;
ALTER TABLE employee_documents ADD COLUMN created_by TEXT;
ALTER TABLE employee_documents ADD COLUMN updated_by TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_type_version
  ON employee_documents(company_id, employee_id, document_type, version_number);

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_previous
  ON employee_documents(company_id, previous_document_id);
