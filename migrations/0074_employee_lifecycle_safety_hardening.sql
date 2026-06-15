-- Employee lifecycle safety hardening: own/all visibility and task-owner scoped actions.

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_employee_lifecycle_resignations_view_own', 'employeeLifecycle.resignations.viewOwn', 'employee_lifecycle', 'resignations_view_own', 'View own resignation requests and requests created on behalf of the linked employee.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_view_own', 'employeeLifecycle.offboarding.viewOwn', 'employee_lifecycle', 'offboarding_view_own', 'View own offboarding requests and requests created on behalf of the linked employee.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_exit_requests_view_all', 'employeeLifecycle.exitRequests.viewAll', 'employee_lifecycle', 'exit_requests_view_all', 'View all company resignation and offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_tasks_view', 'employeeLifecycle.offboarding.tasks.view', 'employee_lifecycle', 'offboarding_tasks_view', 'View assigned or owned offboarding tasks.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_tasks_complete', 'employeeLifecycle.offboarding.tasks.complete', 'employee_lifecycle', 'offboarding_tasks_complete', 'Complete assigned or owned offboarding tasks.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_tasks_waive', 'employeeLifecycle.offboarding.tasks.waive', 'employee_lifecycle', 'offboarding_tasks_waive', 'Waive assigned or owned offboarding tasks with a reason.', '2026-01-01T00:00:00Z');
