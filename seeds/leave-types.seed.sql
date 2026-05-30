INSERT OR IGNORE INTO leave_types (
  id,
  company_id,
  leave_key,
  leave_name,
  is_statutory,
  is_enabled,
  is_paid,
  default_days,
  requires_attachment,
  affects_payroll,
  created_at,
  updated_at
) VALUES
('leave_type_annual_leave', 'company_seed_default', 'annual_leave', 'Annual Leave', 1, 1, 1, 30, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_sick_leave', 'company_seed_default', 'sick_leave', 'Sick Leave', 1, 1, 1, 30, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_frl', 'company_seed_default', 'frl', 'Family Responsibility Leave', 1, 1, 1, 10, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_maternity_leave', 'company_seed_default', 'maternity_leave', 'Maternity Leave', 1, 1, 1, 60, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_paternity_leave', 'company_seed_default', 'paternity_leave', 'Paternity Leave', 1, 1, 1, 3, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_circumcision_leave', 'company_seed_default', 'circumcision_leave', 'Circumcision Leave', 1, 1, 1, 5, 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_unpaid_leave', 'company_seed_default', 'unpaid_leave', 'Unpaid Leave', 0, 1, 0, NULL, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_emergency_leave', 'company_seed_default', 'emergency_leave', 'Emergency Leave', 0, 1, 1, NULL, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('leave_type_extended_annual_leave', 'company_seed_default', 'extended_annual_leave', 'Extended Annual Leave', 0, 1, 1, NULL, 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
