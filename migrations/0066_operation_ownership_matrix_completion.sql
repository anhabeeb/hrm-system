-- Operation ownership matrix completion.
-- Adds canonical target/filter columns while keeping legacy fields from 0065
-- as compatibility aliases for already-created rows.

ALTER TABLE operation_responsibility_matrix ADD COLUMN target_type TEXT;
ALTER TABLE operation_responsibility_matrix ADD COLUMN min_level INTEGER;
ALTER TABLE operation_responsibility_matrix ADD COLUMN max_level INTEGER;
ALTER TABLE operation_responsibility_matrix ADD COLUMN required_permission TEXT;
ALTER TABLE operation_responsibility_matrix ADD COLUMN required_role_id TEXT;
ALTER TABLE operation_responsibility_matrix ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operation_responsibility_matrix ADD COLUMN use_requester_department INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operation_responsibility_matrix ADD COLUMN use_subject_department INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operation_responsibility_matrix ADD COLUMN archived_at TEXT;

UPDATE operation_responsibility_matrix
   SET target_type = CASE
       WHEN target_type IS NOT NULL THEN target_type
       WHEN business_function_id IS NOT NULL THEN 'BUSINESS_FUNCTION'
       WHEN department_id IS NOT NULL THEN 'DEPARTMENT'
       WHEN user_id IS NOT NULL THEN 'SPECIFIC_USER'
       ELSE 'SUPER_ADMIN'
     END,
       responsibility_type = CASE responsibility_type
       WHEN 'FINAL_APPROVER' THEN 'FINAL_APPROVAL'
       WHEN 'EXECUTOR' THEN 'EXECUTION'
       WHEN 'CONFIGURATION_OWNER' THEN 'CONFIGURATION'
       ELSE responsibility_type
     END,
       required_permission = COALESCE(required_permission, permission_key),
       required_role_id = COALESCE(required_role_id, role_id);

CREATE INDEX IF NOT EXISTS idx_operation_responsibility_target_type
  ON operation_responsibility_matrix(company_id, target_type);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_required_permission
  ON operation_responsibility_matrix(company_id, required_permission);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_required_role
  ON operation_responsibility_matrix(company_id, required_role_id);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_level
  ON operation_responsibility_matrix(company_id, min_level, max_level);

INSERT OR IGNORE INTO operation_catalog (
  id, company_id, operation_code, operation_name, module_key, description,
  default_business_function_code, is_sensitive, requires_final_approval, is_active, created_at, updated_at
) VALUES
  ('op_employee_create', NULL, 'EMPLOYEE_CREATE', 'Employee Create', 'employees', 'Create an employee profile.', 'HR_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_update', NULL, 'EMPLOYEE_UPDATE', 'Employee Update', 'employees', 'Update employee HR-controlled profile fields.', 'HR_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_archive', NULL, 'EMPLOYEE_ARCHIVE', 'Employee Archive', 'employees', 'Archive or deactivate an employee profile.', 'HR_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_structure_change', NULL, 'EMPLOYEE_STRUCTURE_CHANGE', 'Employee Structure Change', 'organization', 'Change employee department, position, title, or level.', 'EMPLOYEE_STRUCTURE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_leave_balance_adjustment', NULL, 'LEAVE_BALANCE_ADJUSTMENT', 'Leave Balance Adjustment', 'leave', 'Adjust employee leave balances.', 'HR_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_attendance_manual_entry', NULL, 'ATTENDANCE_MANUAL_ENTRY', 'Attendance Manual Entry', 'attendance', 'Create manual attendance entries.', 'ATTENDANCE_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_attendance_override', NULL, 'ATTENDANCE_OVERRIDE', 'Attendance Override', 'attendance', 'Override attendance records or derived status.', 'ATTENDANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_roster_publish', NULL, 'ROSTER_PUBLISH', 'Roster Publish', 'roster', 'Publish a roster period.', 'ROSTER_FUNCTION', 0, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_roster_unpublish', NULL, 'ROSTER_UNPUBLISH', 'Roster Unpublish', 'roster', 'Unpublish or withdraw a roster period.', 'ROSTER_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_roster_lock', NULL, 'ROSTER_LOCK', 'Roster Lock', 'roster', 'Lock roster period from changes.', 'ROSTER_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payroll_run', NULL, 'PAYROLL_RUN', 'Payroll Run', 'payroll', 'Generate a payroll run.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payroll_finalize', NULL, 'PAYROLL_FINALIZE', 'Payroll Finalize', 'payroll', 'Finalize payroll for a period.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payroll_reopen', NULL, 'PAYROLL_REOPEN', 'Payroll Reopen', 'payroll', 'Reopen finalized payroll.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_advance_salary_request', NULL, 'ADVANCE_SALARY_REQUEST', 'Advance Salary Request', 'payroll', 'Request advance salary.', 'FINANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_advance_salary_payment', NULL, 'ADVANCE_SALARY_PAYMENT', 'Advance Salary Payment', 'payroll', 'Process advance salary payment.', 'FINANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payslip_generate', NULL, 'PAYSLIP_GENERATE', 'Payslip Generate', 'payslips', 'Generate payslips.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payslip_publish', NULL, 'PAYSLIP_PUBLISH', 'Payslip Publish', 'payslips', 'Publish payslips to employees.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_document_kyc_update_canonical', NULL, 'DOCUMENT_KYC_UPDATE', 'Document / KYC Update', 'documents', 'Employee document or KYC update.', 'DOCUMENT_KYC_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_document_approval', NULL, 'DOCUMENT_APPROVAL', 'Document Approval', 'documents', 'Approve employee documents.', 'DOCUMENT_KYC_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_biometric_device_config', NULL, 'BIOMETRIC_DEVICE_CONFIG', 'Biometric Device Config', 'biometric', 'Configure biometric device integration.', 'DEVICE_MANAGEMENT_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_biometric_employee_mapping', NULL, 'BIOMETRIC_EMPLOYEE_MAPPING', 'Biometric Employee Mapping', 'biometric', 'Map biometric identities to employees.', 'DEVICE_MANAGEMENT_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_biometric_punch_reprocess', NULL, 'BIOMETRIC_PUNCH_REPROCESS', 'Biometric Punch Reprocess', 'biometric', 'Reprocess biometric punch data.', 'ATTENDANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_kiosk_config', NULL, 'KIOSK_CONFIG', 'Kiosk Config', 'kiosk', 'Configure attendance kiosk behavior.', 'KIOSK_FUNCTION', 0, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_audit_log_view', NULL, 'AUDIT_LOG_VIEW', 'Audit Log View', 'audit_logs', 'View audit log data.', 'REPORTING_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_system_settings_change', NULL, 'SYSTEM_SETTINGS_CHANGE', 'System Settings Change', 'settings', 'Change company, module, or system settings.', 'SYSTEM_SETTINGS_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_security_settings_change', NULL, 'SECURITY_SETTINGS_CHANGE', 'Security Settings Change', 'settings', 'Change security, session, password, or 2FA settings.', 'SECURITY_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_role_permission_change', NULL, 'ROLE_PERMISSION_CHANGE', 'Role Permission Change', 'users', 'Change roles, permissions, or access grants.', 'SECURITY_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_offboarding', NULL, 'OFFBOARDING', 'Offboarding', 'employees', 'Employee offboarding workflow.', 'HR_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

-- Canonical aliases for operation codes that were seeded in 0065 under
-- earlier names. Future modules should prefer the canonical operation codes
-- above, while these aliases remain for compatibility with existing rows.
