CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  employee_type TEXT NOT NULL,
  nationality TEXT,
  id_card_number TEXT,
  passport_number TEXT,
  phone TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  primary_outlet_id TEXT,
  department_id TEXT,
  position_id TEXT,
  contract_type TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT,
  resigned_at TEXT,
  terminated_at TEXT,
  bank_name TEXT,
  bank_account_masked TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(company_id, employee_code)
);

CREATE TABLE IF NOT EXISTS employee_job_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outlet_id TEXT,
  department_id TEXT,
  position_id TEXT,
  change_type TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_salary_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  monthly_salary_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MVR',
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  reason TEXT,
  approval_request_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'valid',
  is_sensitive INTEGER NOT NULL DEFAULT 1,
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS employee_status_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_notes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  note TEXT NOT NULL,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
