-- Final lifecycle hardening for disciplinary actions.
-- Adds explicit close and official-record row-level permissions.

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_employee_discipline_actions_close', 'employeeDiscipline.actions.close', 'employee_discipline', 'actions_close', 'Close applied disciplinary actions after acknowledgement and required follow-ups.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_records_view_own', 'employeeDiscipline.records.viewOwn', 'employee_discipline', 'records_view_own', 'View own official disciplinary records.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_records_view_all', 'employeeDiscipline.records.viewAll', 'employee_discipline', 'records_view_all', 'View all official disciplinary records within company scope.', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_employee_discipline_self_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN ('employeeDiscipline.records.viewOwn')
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('employee', 'staff', 'supervisor', 'outlet_manager', 'hr_officer', 'hr_admin', 'admin', 'owner', 'super_admin');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_employee_discipline_manage_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'employeeDiscipline.actions.close',
  'employeeDiscipline.records.viewOwn',
  'employeeDiscipline.records.viewAll'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_officer', 'hr_admin', 'admin', 'owner', 'super_admin');
