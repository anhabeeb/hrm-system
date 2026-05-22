-- Initial HRM schema for Cloudflare D1 / SQLite
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Indian/Maldives',
  currency TEXT NOT NULL DEFAULT 'MVR',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','ADMIN','HR','MANAGER','ACCOUNTANT','EMPLOYEE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','INVITED')),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_hint TEXT
);

CREATE TABLE IF NOT EXISTS employee_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  job_title TEXT,
  hire_date TEXT,
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE','ON_LEAVE','TERMINATED','SUSPENDED')),
  salary_type TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (salary_type IN ('MONTHLY','DAILY','HOURLY')),
  base_salary REAL NOT NULL DEFAULT 0,
  overtime_enabled INTEGER NOT NULL DEFAULT 1,
  benefits_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY','OFF_DAY')),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','BIOMETRIC','IMPORT','SYSTEM')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  paid INTEGER NOT NULL DEFAULT 1,
  max_days_per_year INTEGER,
  salary_deduction_mode TEXT NOT NULL DEFAULT 'NONE' CHECK (salary_deduction_mode IN ('NONE','DAILY_RATE','FIXED_AMOUNT','PERCENTAGE')),
  deduction_value REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS overtime_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  rate_multiplier REAL NOT NULL DEFAULT 1.5,
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PAID')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS benefit_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL DEFAULT 0,
  taxable INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_benefits (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  benefit_type_id TEXT NOT NULL REFERENCES benefit_types(id) ON DELETE CASCADE,
  amount_override REAL,
  starts_on TEXT,
  ends_on TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS advances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  advance_date TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING','APPROVED','REJECTED','DEDUCTED')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY,
  period_month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PAID','VOID')),
  generated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  base_salary REAL NOT NULL DEFAULT 0,
  days_worked REAL NOT NULL DEFAULT 0,
  absent_days REAL NOT NULL DEFAULT 0,
  leave_deductions REAL NOT NULL DEFAULT 0,
  absent_deductions REAL NOT NULL DEFAULT 0,
  overtime_amount REAL NOT NULL DEFAULT 0,
  benefits_amount REAL NOT NULL DEFAULT 0,
  advances_amount REAL NOT NULL DEFAULT 0,
  gross_salary REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload_json TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biometric_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  serial_number TEXT UNIQUE,
  location TEXT,
  mode TEXT NOT NULL DEFAULT 'PUSH_API' CHECK (mode IN ('PUSH_API','LOCAL_BRIDGE')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biometric_events (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES biometric_devices(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL,
  event_time TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'CHECK' CHECK (event_type IN ('CHECK','IN','OUT')),
  raw_payload TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('approval_requests_enabled', 'false'),
  ('overtime_enabled', 'true'),
  ('benefits_enabled', 'true'),
  ('long_leave_deduction_mode', 'DAILY_RATE'),
  ('biometric_integration_enabled', 'false');

INSERT OR IGNORE INTO departments (id, name, description) VALUES
  ('dept-admin', 'Administration', 'Default administration department'),
  ('dept-hr', 'Human Resources', 'Default HR department');

INSERT OR IGNORE INTO stores (id, name, location) VALUES
  ('store-main', 'Main Office', 'Default company location');

INSERT OR IGNORE INTO leave_types (id, name, paid, max_days_per_year, salary_deduction_mode, deduction_value) VALUES
  ('leave-annual', 'Annual Leave', 1, 30, 'NONE', 0),
  ('leave-sick', 'Sick Leave', 1, 15, 'NONE', 0),
  ('leave-unpaid', 'Unpaid Leave', 0, NULL, 'DAILY_RATE', 1);
