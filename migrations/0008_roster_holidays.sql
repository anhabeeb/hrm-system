CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER DEFAULT 0,
  is_night_shift INTEGER DEFAULT 0,
  is_split_shift INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_shifts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  shift_template_id TEXT,
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_conflicts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  roster_shift_id TEXT,
  employee_id TEXT,
  outlet_id TEXT,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_paid INTEGER NOT NULL DEFAULT 1,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  repeat_yearly INTEGER NOT NULL DEFAULT 0,
  affects_leave INTEGER NOT NULL DEFAULT 1,
  affects_payroll INTEGER NOT NULL DEFAULT 1,
  affects_attendance INTEGER NOT NULL DEFAULT 1,
  affects_roster INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holiday_outlets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  holiday_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(holiday_id, outlet_id)
);
