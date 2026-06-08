ALTER TABLE shift_templates ADD COLUMN outlet_id TEXT;
ALTER TABLE shift_templates ADD COLUMN department_id TEXT;
ALTER TABLE shift_templates ADD COLUMN code TEXT;
ALTER TABLE shift_templates ADD COLUMN crosses_midnight INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shift_templates ADD COLUMN notes TEXT;
ALTER TABLE shift_templates ADD COLUMN created_by TEXT;
ALTER TABLE shift_templates ADD COLUMN updated_by TEXT;

UPDATE shift_templates
SET active = CASE WHEN status = 'active' THEN 1 ELSE 0 END,
    crosses_midnight = CASE WHEN end_time <= start_time THEN 1 ELSE 0 END
WHERE active IS NULL OR crosses_midnight IS NULL;

ALTER TABLE roster_shifts ADD COLUMN department_id TEXT;
ALTER TABLE roster_shifts ADD COLUMN position_id TEXT;
ALTER TABLE roster_shifts ADD COLUMN roster_date TEXT;
ALTER TABLE roster_shifts ADD COLUMN break_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roster_shifts ADD COLUMN notes TEXT;
ALTER TABLE roster_shifts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE roster_shifts ADD COLUMN updated_by TEXT;
ALTER TABLE roster_shifts ADD COLUMN published_by TEXT;
ALTER TABLE roster_shifts ADD COLUMN cancelled_at TEXT;
ALTER TABLE roster_shifts ADD COLUMN cancelled_by TEXT;
ALTER TABLE roster_shifts ADD COLUMN cancellation_reason TEXT;

UPDATE roster_shifts
SET roster_date = COALESCE(roster_date, shift_date)
WHERE roster_date IS NULL;

ALTER TABLE roster_conflicts ADD COLUMN department_id TEXT;
ALTER TABLE roster_conflicts ADD COLUMN detected_at TEXT;
ALTER TABLE roster_conflicts ADD COLUMN resolution_note TEXT;
ALTER TABLE roster_conflicts ADD COLUMN updated_at TEXT;

UPDATE roster_conflicts
SET detected_at = COALESCE(detected_at, created_at),
    updated_at = COALESCE(updated_at, created_at)
WHERE detected_at IS NULL OR updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_company_code
  ON shift_templates(company_id, code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_templates_company_active
  ON shift_templates(company_id, active);

CREATE INDEX IF NOT EXISTS idx_shift_templates_company_outlet
  ON shift_templates(company_id, outlet_id);

CREATE INDEX IF NOT EXISTS idx_roster_shifts_company_date
  ON roster_shifts(company_id, roster_date);

CREATE INDEX IF NOT EXISTS idx_roster_shifts_company_outlet_date
  ON roster_shifts(company_id, outlet_id, roster_date);

CREATE INDEX IF NOT EXISTS idx_roster_shifts_company_employee_date
  ON roster_shifts(company_id, employee_id, roster_date);

CREATE INDEX IF NOT EXISTS idx_roster_shifts_company_status
  ON roster_shifts(company_id, status);

CREATE INDEX IF NOT EXISTS idx_roster_conflicts_company_status
  ON roster_conflicts(company_id, status);

CREATE INDEX IF NOT EXISTS idx_roster_conflicts_shift_status
  ON roster_conflicts(company_id, roster_shift_id, status);

INSERT OR IGNORE INTO company_settings (
  id, company_id, setting_key, setting_group, setting_value_json,
  effective_from, created_by, updated_by, created_at, updated_at
) VALUES (
  'setting_attendance_roster_rules',
  'company_seed_default',
  'attendance.roster_rules',
  'attendance',
  '{"roster_module_enabled":true,"allow_roster_overlap_override":false,"allow_scheduling_on_leave":false,"allow_scheduling_on_holidays":true,"allow_scheduling_suspended_employee":false,"require_publish_before_attendance":false,"roster_publish_required":false,"default_shift_break_minutes":0,"roster_conflict_warning_days":30}',
  '2026-01-01',
  'system',
  'system',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);
