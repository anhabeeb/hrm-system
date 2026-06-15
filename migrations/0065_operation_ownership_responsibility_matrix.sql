-- Operation ownership / responsibility matrix foundation.
-- This phase creates configurable ownership metadata without changing existing
-- leave, attendance correction, or roster approval behavior.

CREATE TABLE IF NOT EXISTS business_functions (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system_default INTEGER NOT NULL DEFAULT 0,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_functions_company_code
  ON business_functions(COALESCE(company_id, 'SYSTEM'), code);
CREATE INDEX IF NOT EXISTS idx_business_functions_company
  ON business_functions(company_id);
CREATE INDEX IF NOT EXISTS idx_business_functions_active
  ON business_functions(company_id, is_active);

CREATE TABLE IF NOT EXISTS business_function_department_assignments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  business_function_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL DEFAULT 'PRIMARY',
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_function_department_unique_active
  ON business_function_department_assignments(company_id, business_function_id, department_id, assignment_type)
  WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_function_department_function
  ON business_function_department_assignments(company_id, business_function_id);
CREATE INDEX IF NOT EXISTS idx_function_department_department
  ON business_function_department_assignments(company_id, department_id);

CREATE TABLE IF NOT EXISTS operation_catalog (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  operation_code TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  module_key TEXT NOT NULL,
  description TEXT,
  default_business_function_code TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  requires_final_approval INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_catalog_company_code
  ON operation_catalog(COALESCE(company_id, 'SYSTEM'), operation_code);
CREATE INDEX IF NOT EXISTS idx_operation_catalog_company
  ON operation_catalog(company_id);
CREATE INDEX IF NOT EXISTS idx_operation_catalog_module
  ON operation_catalog(company_id, module_key);

CREATE TABLE IF NOT EXISTS operation_responsibility_matrix (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  operation_code TEXT NOT NULL,
  responsibility_type TEXT NOT NULL,
  business_function_id TEXT,
  department_id TEXT,
  role_id TEXT,
  user_id TEXT,
  permission_key TEXT,
  fallback_behavior TEXT NOT NULL DEFAULT 'HOLD_FOR_MANUAL_ASSIGNMENT',
  priority INTEGER NOT NULL DEFAULT 100,
  is_required INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_responsibility_unique_active
  ON operation_responsibility_matrix(company_id, operation_code, responsibility_type, priority)
  WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_operation
  ON operation_responsibility_matrix(company_id, operation_code);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_function
  ON operation_responsibility_matrix(company_id, business_function_id);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_department
  ON operation_responsibility_matrix(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_operation_responsibility_user
  ON operation_responsibility_matrix(company_id, user_id);

INSERT OR IGNORE INTO business_functions (
  id, company_id, code, name, description, is_system_default, is_sensitive, is_active, created_at, updated_at
) VALUES
  ('bf_hr_function', NULL, 'HR_FUNCTION', 'HR Function', 'Owns HR operations, employee lifecycle, leave, KYC, and final HR decisions.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_finance_function', NULL, 'FINANCE_FUNCTION', 'Finance Function', 'Owns finance reporting, payment review, and finance final approvals.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_payroll_function', NULL, 'PAYROLL_FUNCTION', 'Payroll Function', 'Owns payroll, payslips, advances, salary loans, and payroll adjustments.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_attendance_function', NULL, 'ATTENDANCE_FUNCTION', 'Attendance Function', 'Owns attendance records, attendance corrections, and time tracking rules.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_roster_function', NULL, 'ROSTER_FUNCTION', 'Roster Function', 'Owns roster planning, shift changes, and schedule exceptions.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_device_management_function', NULL, 'DEVICE_MANAGEMENT_FUNCTION', 'Device Management Function', 'Owns biometric devices, sync devices, and hardware integration ownership.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_kiosk_function', NULL, 'KIOSK_FUNCTION', 'Kiosk Function', 'Owns kiosk access, kiosk status, and attendance kiosk support.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_document_kyc_function', NULL, 'DOCUMENT_KYC_FUNCTION', 'Document / KYC Function', 'Owns employee documents, KYC updates, and expiry review workflows.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_employee_structure_function', NULL, 'EMPLOYEE_STRUCTURE_FUNCTION', 'Employee Structure Function', 'Owns department, position, level, and role template structure.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_security_function', NULL, 'SECURITY_FUNCTION', 'Security Function', 'Owns access control, sessions, authentication, 2FA, and security settings.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_reporting_function', NULL, 'REPORTING_FUNCTION', 'Reporting Function', 'Owns HR, payroll, export, print, and reporting governance.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_system_settings_function', NULL, 'SYSTEM_SETTINGS_FUNCTION', 'System Settings Function', 'Owns configuration, environment-sensitive settings, and administrative setup.', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bf_general_admin_function', NULL, 'GENERAL_ADMIN_FUNCTION', 'General Admin Function', 'Owns general administration and unassigned operations until configured.', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO operation_catalog (
  id, company_id, operation_code, operation_name, module_key, description,
  default_business_function_code, is_sensitive, requires_final_approval, is_active, created_at, updated_at
) VALUES
  ('op_leave_request', NULL, 'LEAVE_REQUEST', 'Leave Request', 'leave', 'Employee leave request approval and balance application.', 'HR_FUNCTION', 0, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_attendance_correction', NULL, 'ATTENDANCE_CORRECTION', 'Attendance Correction', 'attendance', 'Attendance correction request review and final apply.', 'ATTENDANCE_FUNCTION', 0, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_roster_change', NULL, 'ROSTER_CHANGE', 'Roster Change', 'roster', 'Roster change request review and final apply.', 'ROSTER_FUNCTION', 0, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_payroll_adjustment', NULL, 'PAYROLL_ADJUSTMENT', 'Payroll Adjustment', 'payroll', 'Payroll adjustment review and approval.', 'PAYROLL_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_advance_payment', NULL, 'ADVANCE_PAYMENT', 'Advance Payment', 'payroll', 'Salary advance request and payment approval.', 'FINANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_salary_loan', NULL, 'SALARY_LOAN', 'Salary Loan', 'payroll', 'Salary loan request and finance approval.', 'FINANCE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_document_update', NULL, 'EMPLOYEE_DOCUMENT_UPDATE', 'Employee Document Update', 'documents', 'Employee document and KYC update request.', 'DOCUMENT_KYC_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_transfer', NULL, 'EMPLOYEE_TRANSFER', 'Employee Transfer', 'employees', 'Employee department, outlet, or position transfer.', 'EMPLOYEE_STRUCTURE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_resignation', NULL, 'RESIGNATION', 'Resignation', 'employees', 'Employee resignation and exit workflow.', 'HR_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_disciplinary_action', NULL, 'DISCIPLINARY_ACTION', 'Disciplinary Action', 'employees', 'Disciplinary action workflow and review.', 'HR_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_employee_login_assignment', NULL, 'EMPLOYEE_LOGIN_ASSIGNMENT', 'Employee Login Assignment', 'users', 'Employee-linked login creation and management.', 'SECURITY_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_user_access_change', NULL, 'USER_ACCESS_CHANGE', 'User Access Change', 'users', 'User role, outlet, permission, and access control changes.', 'SECURITY_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_department_position_change', NULL, 'DEPARTMENT_POSITION_CHANGE', 'Department / Position Change', 'organization', 'Department, position, level, and structure governance.', 'EMPLOYEE_STRUCTURE_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_biometric_device_change', NULL, 'BIOMETRIC_DEVICE_CHANGE', 'Biometric Device Change', 'devices', 'Biometric device setup, disablement, and sync ownership.', 'DEVICE_MANAGEMENT_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_kiosk_change', NULL, 'KIOSK_CHANGE', 'Kiosk Change', 'kiosk', 'Kiosk setup and operational ownership.', 'KIOSK_FUNCTION', 0, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_report_export', NULL, 'REPORT_EXPORT', 'Report Export', 'reports', 'Report export, print, and audit-sensitive data extraction.', 'REPORTING_FUNCTION', 1, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_backup_restore', NULL, 'BACKUP_RESTORE', 'Backup / Restore', 'backup', 'Backup, restore preview, and restore approval ownership.', 'SYSTEM_SETTINGS_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_data_retention', NULL, 'DATA_RETENTION', 'Data Retention', 'backup', 'Data retention, archive preview, and archive apply ownership.', 'SYSTEM_SETTINGS_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_system_setting_change', NULL, 'SYSTEM_SETTING_CHANGE', 'System Setting Change', 'settings', 'System, security, module, and company setting changes.', 'SYSTEM_SETTINGS_FUNCTION', 1, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('op_generic_request', NULL, 'GENERIC_REQUEST', 'Generic Request', 'approvals', 'Generic approval request that has not been bound to a module-specific owner.', 'GENERAL_ADMIN_FUNCTION', 0, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
