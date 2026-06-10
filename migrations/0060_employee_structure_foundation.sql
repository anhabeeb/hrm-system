-- Employee structure foundation: Department -> Position/Title -> Level -> role templates.
ALTER TABLE departments ADD COLUMN description TEXT;
ALTER TABLE departments ADD COLUMN head_employee_id TEXT;
ALTER TABLE departments ADD COLUMN day_to_day_management_min_level INTEGER NOT NULL DEFAULT 3;
ALTER TABLE departments ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE departments ADD COLUMN archived_at TEXT;
ALTER TABLE departments ADD COLUMN created_by TEXT;
ALTER TABLE departments ADD COLUMN updated_by TEXT;

ALTER TABLE positions ADD COLUMN description TEXT;
ALTER TABLE positions ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE positions ADD COLUMN default_role_id TEXT;
ALTER TABLE positions ADD COLUMN can_manage_lower_levels INTEGER NOT NULL DEFAULT 0;
ALTER TABLE positions ADD COLUMN can_act_as_department_approver INTEGER NOT NULL DEFAULT 0;
ALTER TABLE positions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE positions ADD COLUMN archived_at TEXT;
ALTER TABLE positions ADD COLUMN created_by TEXT;
ALTER TABLE positions ADD COLUMN updated_by TEXT;

ALTER TABLE employees ADD COLUMN level INTEGER;
ALTER TABLE employees ADD COLUMN structure_updated_at TEXT;
ALTER TABLE employees ADD COLUMN structure_updated_by TEXT;

CREATE TABLE IF NOT EXISTS access_levels (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, level)
);

CREATE TABLE IF NOT EXISTS level_role_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  department_id TEXT,
  position_id TEXT,
  role_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 1,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS employee_structure_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  previous_department_id TEXT,
  previous_position_id TEXT,
  previous_level INTEGER,
  new_department_id TEXT NOT NULL,
  new_position_id TEXT NOT NULL,
  new_level INTEGER NOT NULL CHECK (new_level BETWEEN 1 AND 4),
  reason TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO access_levels (id, company_id, level, name, description, is_active, created_at, updated_at) VALUES
('access_level_1', NULL, 1, 'Employee Self-Service', 'Basic employee self-service access foundation.', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('access_level_2', NULL, 2, 'Senior Employee', 'Senior employee or limited team reviewer foundation.', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('access_level_3', NULL, 3, 'Supervisor', 'Supervisor and department approver candidate foundation.', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
('access_level_4', NULL, 4, 'Department Manager', 'Department head or manager access foundation.', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

UPDATE departments SET is_active = CASE WHEN status = 'active' THEN 1 ELSE 0 END WHERE is_active IS NULL;
UPDATE positions SET is_active = CASE WHEN status = 'active' THEN 1 ELSE 0 END WHERE is_active IS NULL;
UPDATE employees
   SET level = (
     SELECT p.level FROM positions p
      WHERE p.company_id = employees.company_id AND p.id = employees.position_id
      LIMIT 1
   )
 WHERE level IS NULL AND position_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_company_code ON departments(company_id, code);
CREATE INDEX IF NOT EXISTS idx_departments_company_active ON departments(company_id, is_active, archived_at);
CREATE INDEX IF NOT EXISTS idx_positions_company ON positions(company_id);
CREATE INDEX IF NOT EXISTS idx_positions_company_department ON positions(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_positions_company_level ON positions(company_id, level);
CREATE INDEX IF NOT EXISTS idx_positions_company_code ON positions(company_id, code);
CREATE INDEX IF NOT EXISTS idx_employees_company_department_structure ON employees(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_position_structure ON employees(company_id, position_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_level_structure ON employees(company_id, level);
CREATE INDEX IF NOT EXISTS idx_level_role_templates_company_level ON level_role_templates(company_id, level);
CREATE INDEX IF NOT EXISTS idx_level_role_templates_company_department ON level_role_templates(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_level_role_templates_company_position ON level_role_templates(company_id, position_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_level_role_templates_unique_active
  ON level_role_templates(company_id, level, COALESCE(department_id, ''), COALESCE(position_id, ''), role_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_structure_history_company_employee ON employee_structure_history(company_id, employee_id);
