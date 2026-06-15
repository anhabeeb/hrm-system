-- Document/KYC hardening: server-owned staged upload provenance.
-- Client-provided file keys must match one of these records before they can
-- become an official employee document source.

CREATE TABLE IF NOT EXISTS document_upload_staging (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  request_id TEXT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'ATTACHED_TO_REQUEST', 'CONSUMED', 'CANCELLED', 'EXPIRED')),
  purpose TEXT NOT NULL DEFAULT 'DOCUMENT_KYC_UPDATE',
  expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_upload_staging_company_employee
  ON document_upload_staging(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_document_upload_staging_file_key
  ON document_upload_staging(company_id, file_key);

CREATE INDEX IF NOT EXISTS idx_document_upload_staging_request
  ON document_upload_staging(company_id, request_id);
