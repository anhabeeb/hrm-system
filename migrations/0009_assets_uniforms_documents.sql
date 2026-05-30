CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  outlet_id TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  purchase_value_amount INTEGER,
  current_condition TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(company_id, asset_code)
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  employee_id TEXT,
  outlet_id TEXT,
  issued_date TEXT NOT NULL,
  returned_date TEXT,
  issue_condition TEXT,
  return_condition TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_deductions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  asset_assignment_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approval_request_id TEXT,
  payroll_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uniform_issues (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outlet_id TEXT,
  uniform_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  issued_date TEXT NOT NULL,
  returned_date TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category_key TEXT NOT NULL,
  category_name TEXT NOT NULL,
  is_sensitive INTEGER NOT NULL DEFAULT 1,
  requires_expiry_date INTEGER NOT NULL DEFAULT 0,
  applies_to_foreign_employee INTEGER NOT NULL DEFAULT 0,
  applies_to_local_employee INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, category_key)
);

CREATE TABLE IF NOT EXISTS document_access_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  document_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
