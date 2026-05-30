CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_group TEXT,
  setting_value_json TEXT NOT NULL,
  effective_from TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, setting_key)
);

CREATE TABLE IF NOT EXISTS feature_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disabled',
  applies_to_all_outlets INTEGER NOT NULL DEFAULT 1,
  allowed_outlet_ids_json TEXT,
  allowed_role_ids_json TEXT,
  affects_payroll INTEGER NOT NULL DEFAULT 0,
  affects_attendance INTEGER NOT NULL DEFAULT 0,
  affects_leave INTEGER NOT NULL DEFAULT 0,
  affects_roster INTEGER NOT NULL DEFAULT 0,
  offline_enabled INTEGER NOT NULL DEFAULT 0,
  audit_enabled INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, feature_key)
);

CREATE TABLE IF NOT EXISTS holiday_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  holiday_module_enabled INTEGER NOT NULL DEFAULT 1,
  public_holidays_enabled INTEGER NOT NULL DEFAULT 1,
  company_holidays_enabled INTEGER NOT NULL DEFAULT 1,
  other_holidays_enabled INTEGER NOT NULL DEFAULT 1,
  outlet_specific_holidays_enabled INTEGER NOT NULL DEFAULT 1,
  holiday_pay_enabled INTEGER NOT NULL DEFAULT 1,
  holiday_leave_rules_enabled INTEGER NOT NULL DEFAULT 1,
  holiday_attendance_rules_enabled INTEGER NOT NULL DEFAULT 1,
  holiday_roster_rules_enabled INTEGER NOT NULL DEFAULT 1,
  exclude_holidays_from_leave INTEGER NOT NULL DEFAULT 0,
  pay_holidays_during_long_leave INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS long_leave_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  applies_to_foreigners INTEGER NOT NULL DEFAULT 1,
  applies_to_locals INTEGER NOT NULL DEFAULT 0,
  trigger_days INTEGER NOT NULL DEFAULT 30,
  max_continuous_days INTEGER,
  salary_rule TEXT NOT NULL DEFAULT 'pay_only_worked_days',
  pay_only_worked_days INTEGER NOT NULL DEFAULT 1,
  deduct_full_salary_if_zero_worked_days INTEGER NOT NULL DEFAULT 1,
  count_holidays_inside_leave INTEGER NOT NULL DEFAULT 1,
  pay_holidays_during_long_leave INTEGER NOT NULL DEFAULT 0,
  pay_weekly_off_days_during_long_leave INTEGER NOT NULL DEFAULT 0,
  allow_hr_override INTEGER NOT NULL DEFAULT 1,
  require_salary_impact_preview INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_change_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  setting_group TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  changed_by TEXT NOT NULL,
  reason TEXT,
  effective_date TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
