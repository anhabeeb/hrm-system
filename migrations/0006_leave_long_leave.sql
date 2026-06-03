CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  leave_key TEXT NOT NULL,
  leave_name TEXT NOT NULL,
  is_statutory INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_paid INTEGER NOT NULL DEFAULT 1,
  default_days INTEGER,
  requires_attachment INTEGER NOT NULL DEFAULT 0,
  affects_payroll INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, leave_key)
);

CREATE TABLE IF NOT EXISTS leave_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  employee_type TEXT,
  leave_type_id TEXT NOT NULL,
  entitlement_days INTEGER NOT NULL,
  carry_forward_days INTEGER DEFAULT 0,
  allow_negative_balance INTEGER NOT NULL DEFAULT 0,
  max_continuous_days INTEGER,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  opening_balance REAL DEFAULT 0,
  accrued_days REAL DEFAULT 0,
  used_days REAL DEFAULT 0,
  remaining_days REAL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT,
  approval_request_id TEXT,
  affects_payroll INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS long_leave_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  expected_return_date TEXT NOT NULL,
  actual_return_date TEXT,
  total_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  salary_impact_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS long_leave_salary_impacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  long_leave_record_id TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  monthly_salary_amount INTEGER NOT NULL,
  salary_calculation_days INTEGER NOT NULL,
  worked_days REAL NOT NULL,
  long_leave_days REAL NOT NULL,
  daily_salary_amount INTEGER NOT NULL,
  estimated_payable_amount INTEGER NOT NULL,
  final_payable_amount INTEGER,
  override_amount INTEGER,
  override_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
