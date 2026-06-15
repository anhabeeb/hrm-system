-- Employee document / KYC approval engine integration.
-- Additive only: existing employee_documents and legacy profile KYC request flows remain valid.

ALTER TABLE employee_documents ADD COLUMN verification_status TEXT DEFAULT 'VERIFIED';
ALTER TABLE employee_documents ADD COLUMN source_kyc_request_id TEXT;
ALTER TABLE employee_documents ADD COLUMN verified_at TEXT;
ALTER TABLE employee_documents ADD COLUMN verified_by TEXT;
ALTER TABLE employee_documents ADD COLUMN rejected_at TEXT;
ALTER TABLE employee_documents ADD COLUMN rejected_by TEXT;
ALTER TABLE employee_documents ADD COLUMN rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS employee_kyc_update_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  outlet_id TEXT,
  request_type TEXT NOT NULL,
  document_type TEXT,
  document_id TEXT,
  requested_field TEXT,
  current_value_json TEXT,
  requested_value_json TEXT,
  staged_file_key TEXT,
  staged_file_name TEXT,
  staged_mime_type TEXT,
  staged_file_size INTEGER,
  reason TEXT NOT NULL,
  employee_note TEXT,
  reviewer_note TEXT,
  final_approver_note TEXT,
  apply_note TEXT,
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  verification_status TEXT NOT NULL DEFAULT 'DRAFT',
  owner_reviewed_at TEXT,
  owner_reviewed_by TEXT,
  final_approved_at TEXT,
  final_approved_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_MANUAL_REVIEW','APPROVED','REJECTED','CANCELLED','APPLIED','FAILED_TO_APPLY')),
  CHECK (verification_status IN ('DRAFT','PENDING_REVIEW','VERIFIED','REJECTED','EXPIRED','ARCHIVED','SUPERSEDED'))
);

CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_company ON employee_kyc_update_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_employee ON employee_kyc_update_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_requester_employee ON employee_kyc_update_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_approval ON employee_kyc_update_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_status ON employee_kyc_update_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_department ON employee_kyc_update_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_outlet ON employee_kyc_update_requests(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_kyc_source ON employee_documents(company_id, source_kyc_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_verification_status ON employee_documents(company_id, verification_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_kyc_one_active_approval
ON employee_kyc_update_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_kyc_pending_guard
ON employee_kyc_update_requests(company_id, employee_id, request_type, COALESCE(document_type, ''), COALESCE(requested_field, ''))
WHERE status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_MANUAL_REVIEW','APPROVED');

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_document_kyc_requests_view', 'documentKyc.requests.view', 'documents', 'kyc_requests_view', 'View employee document and KYC update requests.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_create', 'documentKyc.requests.create', 'documents', 'kyc_requests_create', 'Create own document and KYC update requests.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_create_for_others', 'documentKyc.requests.createForOthers', 'documents', 'kyc_requests_create_for_others', 'Create document and KYC update requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_submit', 'documentKyc.requests.submit', 'documents', 'kyc_requests_submit', 'Submit document and KYC update requests for approval.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_review', 'documentKyc.requests.review', 'documents', 'kyc_requests_review', 'Review document and KYC update request steps.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_approve', 'documentKyc.requests.approve', 'documents', 'kyc_requests_approve', 'Approve document and KYC update request steps.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_reject', 'documentKyc.requests.reject', 'documents', 'kyc_requests_reject', 'Reject document and KYC update request steps.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_final_approve', 'documentKyc.requests.finalApprove', 'documents', 'kyc_requests_final_approve', 'Final-approve document and KYC update requests.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_cancel', 'documentKyc.requests.cancel', 'documents', 'kyc_requests_cancel', 'Cancel own document and KYC update requests.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_cancel_any', 'documentKyc.requests.cancelAny', 'documents', 'kyc_requests_cancel_any', 'Cancel document and KYC update requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_apply', 'documentKyc.requests.apply', 'documents', 'kyc_requests_apply', 'Apply approved document and KYC update requests.', '2026-01-01T00:00:00Z'),
  ('perm_document_kyc_requests_audit_view', 'documentKyc.requests.audit.view', 'documents', 'kyc_requests_audit_view', 'View document and KYC approval timelines and audit.', '2026-01-01T00:00:00Z'),
  ('perm_employee_documents_verify', 'employeeDocuments.verify', 'documents', 'employee_documents_verify', 'Verify employee documents after approval.', '2026-01-01T00:00:00Z');

INSERT INTO approval_workflows (
  id, company_id, code, workflow_key, workflow_name, name, description, module, operation_type,
  status, is_enabled, is_default, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_document_kyc_update_default', 'company_seed_default', 'DOCUMENT_KYC_UPDATE_DEFAULT',
  'document_kyc_update_default', 'Document / KYC Update Default', 'Document / KYC Update Default',
  'Operation ownership driven document and KYC update approval workflow.', 'documents', 'DOCUMENT_KYC_UPDATE',
  'ACTIVE', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows
   WHERE company_id = 'company_seed_default'
     AND operation_type = 'DOCUMENT_KYC_UPDATE'
     AND code = 'DOCUMENT_KYC_UPDATE_DEFAULT'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_document_kyc_owner_review', 'company_seed_default', 'workflow_document_kyc_update_default',
  1, 'OWNER_REVIEW', 'Operation Owner Review', 'OPERATION_OWNER',
  'documentKyc.requests.review', 'HOLD_FOR_MANUAL_ASSIGNMENT', 0, 0, 1,
  'operation_owner', 'documentKyc.requests.review', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_document_kyc_update_default'
     AND step_code = 'OWNER_REVIEW'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_document_kyc_final_approval', 'company_seed_default', 'workflow_document_kyc_update_default',
  2, 'FINAL_APPROVAL', 'Operation Final Approval', 'OPERATION_FINAL_APPROVER',
  'documentKyc.requests.finalApprove', 'HOLD_FOR_MANUAL_ASSIGNMENT', 1, 0, 1,
  'operation_final_approver', 'documentKyc.requests.finalApprove', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_document_kyc_update_default'
     AND step_code = 'FINAL_APPROVAL'
);
