INSERT OR IGNORE INTO roles (id, company_id, role_key, role_name, description, is_system_role, is_active, created_at, updated_at) VALUES
('role_super_admin', 'company_seed_default', 'super_admin', 'Super Admin', 'Full system access. Can manage settings, users, permissions, payroll, backups, and security.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_admin', 'company_seed_default', 'admin', 'Admin', 'General admin access. Can manage day-to-day HRM operations if permissions are granted.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_owner', 'company_seed_default', 'owner', 'Owner', 'Business owner/director access. Can view company-wide reports and approve sensitive actions.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_hr_admin', 'company_seed_default', 'hr_admin', 'HR Admin', 'Manages employees, leave, attendance, documents, and HR workflows.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_hr_officer', 'company_seed_default', 'hr_officer', 'HR Officer', 'Supports HR data entry and HR operations with limited permissions.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_accountant', 'company_seed_default', 'accountant', 'Accountant', 'Handles payroll, advances, loans, deductions, payslips, and payroll reports.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_outlet_manager', 'company_seed_default', 'outlet_manager', 'Outlet Manager', 'Manages own outlet attendance, roster, leave requests, and operational approvals.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_supervisor', 'company_seed_default', 'supervisor', 'Supervisor', 'Limited outlet-level operational access.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_employee', 'company_seed_default', 'employee', 'Employee', 'Optional employee portal user. Employee login is disabled by default.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_auditor', 'company_seed_default', 'auditor', 'Auditor', 'Read-only audit/report access.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('role_it_admin', 'company_seed_default', 'it_admin', 'IT Admin', 'Technical system access for devices, sync, backups, health, and security settings. Does not see salary/payroll by default unless granted.', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_super_admin_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_super_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions;

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_admin_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN (
  'employees', 'my_profile', 'profile_update_requests', 'outlets', 'departments', 'positions',
  'attendance', 'kiosk', 'biometric', 'leave', 'leave_settings', 'leave_types',
  'leave_policy_limits', 'leave_policy_override', 'long_leave', 'payroll', 'payroll_settings',
  'salary', 'payslips', 'advances', 'salary_loans', 'holidays', 'roster', 'roster_settings',
  'assets', 'uniforms', 'assets_settings', 'documents', 'documents_settings', 'approvals',
  'approval_workflows', 'approval_thresholds', 'users', 'roles', 'settings', 'feature_settings',
  'attendance_settings', 'holiday_settings', 'sync_settings', 'realtime_settings',
  'audit_settings', 'import_export_settings', 'reports', 'import', 'export', 'audit_logs',
  'notifications'
)
AND permission_key NOT IN (
  'permissions.manage',
  'security_settings.manage',
  'security.2fa.disable_user_2fa',
  'security.2fa.require_for_roles',
  'backup.restore_approve',
  'backup.download',
  'export.full_company_data',
  'audit_logs.view_sensitive',
  'approval_thresholds.reset_defaults',
  'system.cost.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_owner_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_owner', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'employees.view', 'employees.export', 'attendance.view', 'leave.view', 'long_leave.view',
  'long_leave.approve', 'long_leave.reject', 'long_leave.approve_salary_impact',
  'payroll.view', 'payroll.review', 'payroll.approve', 'payroll.reject', 'payroll.lock',
  'payroll.approve_reopen', 'payroll.export', 'salary.view', 'salary.history',
  'payslips.view', 'payslips.download', 'advances.view', 'advances.approve', 'advances.reject',
  'salary_loans.view', 'salary_loans.approve', 'holidays.view', 'roster.view',
  'assets.view', 'assets.approve_deduction', 'documents.view', 'approvals.view',
  'approvals.approve', 'approvals.reject', 'approvals.view_history',
  'approval_thresholds.view', 'approval_thresholds.approve_changes', 'reports.view',
  'reports.export', 'audit_logs.view', 'audit_logs.export', 'backup.view',
  'backup.restore_request', 'backup.restore_approve', 'backup.view_history',
  'export.view', 'export.download', 'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_admin_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_hr_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN (
  'employees', 'my_profile', 'profile_update_requests', 'outlets', 'departments', 'positions',
  'attendance', 'kiosk', 'biometric', 'leave', 'leave_settings', 'leave_types',
  'leave_policy_limits', 'leave_policy_override', 'long_leave', 'holidays', 'roster',
  'assets', 'uniforms', 'documents', 'documents_settings', 'approvals', 'reports',
  'import', 'export', 'notifications'
)
AND permission_key NOT IN (
  'employees.view_sensitive',
  'documents.view_sensitive',
  'payroll.view',
  'payroll.lock',
  'salary.view',
  'salary.history',
  'export.sensitive',
  'export.full_company_data'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_officer_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_hr_officer', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'employees.view', 'employees.create', 'employees.edit', 'employees.export',
  'my_profile.view', 'my_profile.change_password', 'my_profile.manage_own_2fa',
  'my_profile.submit_kyc_update', 'profile_update_requests.view',
  'outlets.view', 'departments.view', 'positions.view', 'attendance.view',
  'attendance.manual_entry', 'leave.view', 'leave.create', 'leave.edit',
  'long_leave.view', 'documents.view', 'documents.upload', 'documents.download',
  'documents.view_expiring', 'documents.view_missing', 'uniforms.view', 'uniforms.issue',
  'assets.view', 'reports.view', 'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_accountant_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_accountant', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN ('my_profile', 'payroll', 'payroll_settings', 'salary', 'payslips', 'advances', 'salary_loans', 'reports', 'export', 'notifications')
AND permission_key NOT IN ('export.sensitive', 'export.full_company_data', 'salary.increment_approve');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_outlet_manager_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_outlet_manager', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'employees.view', 'my_profile.view', 'my_profile.change_password', 'my_profile.manage_own_2fa',
  'my_profile.submit_kyc_update', 'attendance.view', 'attendance.create',
  'attendance.manual_entry', 'attendance.approve_correction', 'attendance.reject_correction',
  'attendance.view_conflicts', 'attendance.export', 'kiosk.view', 'leave.view',
  'leave.create', 'leave.approve', 'leave.reject', 'long_leave.view', 'roster.view',
  'roster.create', 'roster.edit', 'roster.publish', 'roster.view_conflicts',
  'roster.resolve_conflicts', 'roster.export', 'holidays.view', 'assets.view',
  'uniforms.view', 'reports.view', 'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_supervisor_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_supervisor', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'my_profile.view', 'my_profile.change_password', 'my_profile.manage_own_2fa',
  'my_profile.submit_kyc_update', 'employees.view', 'attendance.view',
  'kiosk.view', 'leave.view', 'roster.view', 'holidays.view', 'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_employee_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_employee', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'my_profile.view',
  'my_profile.change_password',
  'my_profile.manage_own_2fa',
  'my_profile.submit_kyc_update',
  'my_profile.view_activity',
  'security.2fa.manage_own',
  'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_auditor_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_auditor', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'employees.view', 'attendance.view', 'leave.view', 'long_leave.view', 'payroll.view',
  'salary.view', 'payslips.view', 'advances.view', 'salary_loans.view', 'holidays.view',
  'roster.view', 'assets.view', 'documents.view', 'approvals.view',
  'approvals.view_history', 'reports.view', 'reports.export', 'audit_logs.view',
  'audit_logs.export', 'backup.view_history', 'system.errors.view', 'notifications.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_it_admin_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_it_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN (
  'my_profile', 'sync', 'devices', 'backup', 'system', 'security', 'security_settings',
  'sync_settings', 'realtime_settings', 'backup_settings', 'audit_settings',
  'import_export_settings', 'notifications'
)
AND permission_key NOT IN (
  'backup.restore_approve',
  'backup.download',
  'export.sensitive',
  'export.full_company_data'
);
