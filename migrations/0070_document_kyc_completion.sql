-- Document / KYC approval completion hardening.
-- Additive only: these columns support approved employee self-service profile/document changes.

ALTER TABLE employees ADD COLUMN email TEXT;
ALTER TABLE employees ADD COLUMN address TEXT;
ALTER TABLE employees ADD COLUMN emergency_contact_relationship TEXT;
ALTER TABLE employees ADD COLUMN bank_account_holder TEXT;

ALTER TABLE employee_kyc_update_requests ADD COLUMN document_number TEXT;
ALTER TABLE employee_kyc_update_requests ADD COLUMN issue_date TEXT;
ALTER TABLE employee_kyc_update_requests ADD COLUMN expiry_date TEXT;
ALTER TABLE employee_kyc_update_requests ADD COLUMN issuing_country TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_document_type
ON employee_kyc_update_requests(company_id, document_type);

CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_verification_status
ON employee_kyc_update_requests(company_id, verification_status);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_approval_engine_operation_owner_view', 'approvals.operationOwner.view', 'approvals', 'operation_owner_view', 'View approval requests assigned to operation owners.', '2026-01-01T00:00:00Z'),
  ('perm_approval_engine_operation_owner_approve', 'approvals.operationOwner.approve', 'approvals', 'operation_owner_approve', 'Approve operation-owner approval steps when eligible.', '2026-01-01T00:00:00Z'),
  ('perm_approval_engine_operation_owner_reject', 'approvals.operationOwner.reject', 'approvals', 'operation_owner_reject', 'Reject operation-owner approval steps when eligible.', '2026-01-01T00:00:00Z'),
  ('perm_approval_engine_operation_final_view', 'approvals.operationFinal.view', 'approvals', 'operation_final_view', 'View operation-final approval queues.', '2026-01-01T00:00:00Z'),
  ('perm_approval_engine_operation_final_approve', 'approvals.operationFinal.approve', 'approvals', 'operation_final_approve', 'Approve operation-final approval steps when eligible.', '2026-01-01T00:00:00Z'),
  ('perm_approval_engine_operation_final_reject', 'approvals.operationFinal.reject', 'approvals', 'operation_final_reject', 'Reject operation-final approval steps when eligible.', '2026-01-01T00:00:00Z'),
  ('perm_employee_documents_download', 'employeeDocuments.download', 'documents', 'employee_documents_download', 'Download employee documents when row-level access allows.', '2026-01-01T00:00:00Z');
