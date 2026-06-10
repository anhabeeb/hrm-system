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
  'audit_settings', 'import_export_settings', 'dashboard', 'reports', 'import', 'export', 'audit_logs',
  'notifications', 'expiry_alerts'
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
  'long_leave.approve', 'long_leave.reject', 'long_leave.cancel', 'long_leave.extend',
  'long_leave.return', 'long_leave.approve_salary_impact', 'long_leave.payroll_preview', 'long_leave.payroll_apply',
  'payroll.view', 'payroll.review', 'payroll.approve', 'payroll.reject', 'payroll.finalize', 'payroll.lock',
  'payroll.approve_reopen', 'payroll.export', 'salary.view', 'salary.history',
  'payslips.view', 'payslips.download', 'advances.view', 'advances.approve', 'advances.reject',
  'salary_loans.view', 'salary_loans.approve', 'holidays.view', 'roster.view',
  'assets.view', 'assets.approve_deduction', 'documents.view', 'approvals.view',
  'approvals.approve', 'approvals.reject', 'approvals.view_history',
  'approval_thresholds.view', 'approval_thresholds.approve_changes', 'dashboard.view', 'dashboard.view_company',
  'dashboard.attendance.view', 'dashboard.leave.view', 'dashboard.long_leave.view',
  'dashboard.expiry_alerts.view', 'dashboard.device_health.view', 'dashboard.payroll_readiness.view',
  'dashboard.admin_health.view', 'reports.view',
  'reports.export', 'audit_logs.view', 'audit_logs.export', 'backup.view',
  'backup.restore_request', 'backup.restore_approve', 'backup.view_history',
  'export.view', 'export.download', 'notifications.view', 'expiry_alerts.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_admin_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_hr_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN (
  'employees', 'my_profile', 'profile_update_requests', 'outlets', 'departments', 'positions',
  'attendance', 'kiosk', 'biometric', 'leave', 'leave_settings', 'leave_types',
  'leave_policy_limits', 'leave_policy_override', 'long_leave', 'holidays', 'roster',
  'assets', 'uniforms', 'documents', 'documents_settings', 'approvals', 'dashboard', 'reports',
  'import', 'export', 'notifications', 'expiry_alerts'
)
AND permission_key NOT IN (
  'employees.view_sensitive',
  'documents.view_sensitive',
  'payroll.view',
  'payroll.finalize',
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
  'outlets.view', 'departments.view', 'positions.view',
  'organization.departments.view', 'organization.positions.view', 'organization.levels.view',
  'organization.levelRoleTemplates.view', 'employees.structure.view',
  'attendance.view',
  'attendance.manual_entry', 'leave.view', 'leave.create', 'leave.edit',
  'long_leave.view', 'documents.view', 'documents.upload', 'documents.download',
  'documents.view_expiring', 'documents.view_missing', 'uniforms.view', 'uniforms.issue',
  'assets.view', 'dashboard.view', 'dashboard.view_outlet', 'dashboard.attendance.view',
  'dashboard.leave.view', 'dashboard.long_leave.view', 'dashboard.expiry_alerts.view',
  'reports.view', 'notifications.view', 'expiry_alerts.view', 'expiry_alerts.acknowledge'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_admin_employee_structure_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'organization.departments.view', 'organization.departments.manage',
  'organization.positions.view', 'organization.positions.manage',
  'organization.levels.view',
  'organization.levelRoleTemplates.view', 'organization.levelRoleTemplates.manage',
  'employees.structure.view', 'employees.structure.manage'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_employee_structure_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_hr_officer', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'organization.departments.view', 'organization.departments.manage',
  'organization.positions.view', 'organization.positions.manage',
  'organization.levels.view',
  'organization.levelRoleTemplates.view', 'organization.levelRoleTemplates.manage',
  'employees.structure.view', 'employees.structure.manage'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_accountant_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_accountant', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE module IN ('my_profile', 'payroll', 'payroll_settings', 'salary', 'payslips', 'advances', 'salary_loans', 'long_leave', 'dashboard', 'reports', 'export', 'notifications')
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
  'uniforms.view', 'dashboard.view', 'dashboard.view_outlet', 'dashboard.attendance.view',
  'dashboard.leave.view', 'dashboard.long_leave.view', 'dashboard.expiry_alerts.view',
  'dashboard.device_health.view', 'reports.view', 'notifications.view', 'expiry_alerts.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_supervisor_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_supervisor', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'my_profile.view', 'my_profile.change_password', 'my_profile.manage_own_2fa',
  'my_profile.submit_kyc_update', 'employees.view', 'attendance.view',
  'kiosk.view', 'leave.view', 'roster.view', 'holidays.view', 'dashboard.view',
  'dashboard.view_outlet', 'dashboard.attendance.view', 'dashboard.leave.view',
  'notifications.view', 'expiry_alerts.view'
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
  'auth.sessions.view_own',
  'auth.sessions.revoke_own',
  'security.2fa.manage_own',
  'notifications.view',
  'expiry_alerts.view_own'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_auditor_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_auditor', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'employees.view', 'attendance.view', 'leave.view', 'long_leave.view', 'payroll.view',
  'salary.view', 'payslips.view', 'advances.view', 'salary_loans.view', 'holidays.view',
  'roster.view', 'assets.view', 'documents.view', 'approvals.view', 'dashboard.view', 'dashboard.view_company',
  'dashboard.attendance.view', 'dashboard.leave.view', 'dashboard.long_leave.view',
  'dashboard.expiry_alerts.view', 'dashboard.device_health.view', 'dashboard.payroll_readiness.view',
  'approvals.view_history', 'reports.view', 'reports.export', 'audit_logs.view',
  'audit_logs.export', 'backup.view_history', 'system.errors.view', 'notifications.view', 'expiry_alerts.view'
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

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_backup_recovery_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permissions.permission_key IN (
  'backup_recovery.view',
  'backup_recovery.backup.create',
  'backup_recovery.backup.generate',
  'backup_recovery.backup.download',
  'backup_recovery.backup.cancel',
  'backup_recovery.restore.create',
  'backup_recovery.restore.preview',
  'backup_recovery.restore.apply',
  'backup_recovery.restore.cancel',
  'backup_recovery.settings.manage',
  'backup_recovery.audit.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('super_admin', 'admin');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_backup_recovery_it_' || replace(permission_key, '.', '_'), 'company_seed_default', 'role_it_admin', permission_key, '2026-01-01T00:00:00Z'
FROM permissions
WHERE permission_key IN (
  'backup_recovery.view',
  'backup_recovery.backup.create',
  'backup_recovery.backup.generate',
  'backup_recovery.backup.cancel',
  'backup_recovery.restore.create',
  'backup_recovery.restore.preview',
  'backup_recovery.restore.cancel',
  'backup_recovery.settings.manage',
  'backup_recovery.audit.view'
);

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_leave_approval_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'leave.requests.submit',
  'leave.requests.create_for_employee',
  'leave.requests.cancel',
  'leave.requests.withdraw',
  'leave.requests.override',
  'leave.approvals.view',
  'leave.approvals.approve',
  'leave.approvals.reject',
  'leave.approvals.delegate',
  'leave.approvals.escalate',
  'leave.approvals.override',
  'leave.approvals.settings.manage',
  'leave.timeline.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('owner', 'admin', 'hr_admin', 'super_admin');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_leave_approval_manager_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'leave.requests.submit',
  'leave.requests.withdraw',
  'leave.approvals.view',
  'leave.approvals.approve',
  'leave.approvals.reject',
  'leave.approvals.delegate',
  'leave.timeline.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('outlet_manager', 'department_manager', 'manager');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_notifications_self_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'notifications.manage_own',
  'notifications.mark_read',
  'notifications.archive',
  'notifications.preferences.manage',
  'email_notifications.view_own',
  'email_notifications.preferences.manage'
)
WHERE roles.company_id = 'company_seed_default'
  AND EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.company_id = roles.company_id
      AND rp.role_id = roles.id
      AND rp.permission_key = 'notifications.view'
  );

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_reports_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'hr_reports.view',
  'hr_reports.employee.view',
  'hr_reports.compliance.view',
  'hr_reports.documents.view',
  'hr_reports.leave.view',
  'hr_reports.long_leave.view',
  'hr_reports.assets.view',
  'hr_reports.lifecycle.view',
  'hr_reports.employee_360.view',
  'hr_reports.catalog.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('admin', 'owner', 'hr_admin', 'hr_officer', 'auditor');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_hr_reports_manager_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'hr_reports.view',
  'hr_reports.employee.view',
  'hr_reports.leave.view',
  'hr_reports.long_leave.view',
  'hr_reports.assets.view',
  'hr_reports.employee_360.view',
  'hr_reports.catalog.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('outlet_manager', 'supervisor');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_payroll_reports_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'payroll_reports.view',
  'payroll_reports.catalog.view',
  'payroll_reports.summary.view',
  'payroll_reports.employee.view',
  'payroll_reports.salary.view',
  'payroll_reports.deductions.view',
  'payroll_reports.advances.view',
  'payroll_reports.loans.view',
  'payroll_reports.attendance_deductions.view',
  'payroll_reports.overtime.view',
  'payroll_reports.long_leave.view',
  'payroll_reports.leave_deductions.view',
  'payroll_reports.payslips.view',
  'payroll_reports.approvals.view',
  'payroll_reports.cost.view',
  'payroll_reports.variance.view',
  'payroll_reports.audit.view',
  'payroll_reports.finance_summary.view',
  'payroll_reports.sensitive_amounts.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('admin', 'owner', 'accountant', 'auditor');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_payroll_reports_hr_limited_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'payroll_reports.catalog.view',
  'payroll_reports.view',
  'payroll_reports.summary.view',
  'payroll_reports.attendance_deductions.view',
  'payroll_reports.long_leave.view',
  'payroll_reports.leave_deductions.view',
  'payroll_reports.payslips.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_admin', 'hr_officer');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_report_exports_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'report_exports.catalog.view',
  'report_exports.preview',
  'report_exports.create',
  'report_exports.download',
  'report_exports.cancel',
  'report_exports.history.view',
  'report_exports.print',
  'report_exports.sensitive',
  'report_exports.admin.manage',
  'report_exports.employee_profile.print',
  'report_exports.audit.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('super_admin', 'admin', 'owner', 'accountant', 'auditor');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_report_exports_hr_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'report_exports.catalog.view',
  'report_exports.preview',
  'report_exports.create',
  'report_exports.download',
  'report_exports.cancel',
  'report_exports.history.view',
  'report_exports.print',
  'report_exports.employee_profile.print'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_admin', 'hr_officer', 'outlet_manager', 'supervisor');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_imports_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'imports.view',
  'imports.templates.view',
  'imports.upload',
  'imports.preview',
  'imports.apply',
  'imports.cancel',
  'imports.history.view',
  'imports.errors.view',
  'imports.employee.manage',
  'imports.documents.manage',
  'imports.leave_balances.manage',
  'imports.salary.manage',
  'imports.attendance.manage',
  'imports.holidays.manage',
  'imports.assets.manage',
  'imports.advances_loans.manage',
  'imports.sensitive.manage'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('super_admin', 'admin', 'owner');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_imports_hr_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'imports.view',
  'imports.templates.view',
  'imports.upload',
  'imports.preview',
  'imports.apply',
  'imports.cancel',
  'imports.history.view',
  'imports.errors.view',
  'imports.employee.manage',
  'imports.documents.manage',
  'imports.leave_balances.manage',
  'imports.attendance.manage',
  'imports.holidays.manage',
  'imports.assets.manage'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_admin', 'hr_officer');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_imports_payroll_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'imports.view',
  'imports.templates.view',
  'imports.upload',
  'imports.preview',
  'imports.apply',
  'imports.cancel',
  'imports.history.view',
  'imports.errors.view',
  'imports.salary.manage',
  'imports.advances_loans.manage',
  'imports.sensitive.manage'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('accountant');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_data_retention_admin_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'data_retention.view',
  'data_retention.settings.manage',
  'data_retention.preview',
  'data_retention.archive',
  'data_retention.restore',
  'data_retention.cancel_job',
  'data_retention.audit.view',
  'data_retention.purge'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('super_admin', 'admin', 'owner');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_data_retention_hr_view_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'data_retention.view',
  'data_retention.preview',
  'data_retention.audit.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_admin', 'hr_officer', 'auditor');
