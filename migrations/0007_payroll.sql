CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  calculation_basis TEXT NOT NULL,
  total_gross_amount INTEGER DEFAULT 0,
  total_deduction_amount INTEGER DEFAULT 0,
  total_net_amount INTEGER DEFAULT 0,
  calculated_by TEXT,
  approved_by TEXT,
  locked_by TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, payroll_month)
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outlet_id TEXT,
  basic_salary_amount INTEGER NOT NULL,
  payable_basic_amount INTEGER NOT NULL,
  gross_amount INTEGER NOT NULL,
  total_deductions_amount INTEGER NOT NULL,
  net_amount INTEGER NOT NULL,
  carry_forward_deduction_amount INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS payroll_earnings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_item_id TEXT NOT NULL,
  earning_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  source_type TEXT,
  source_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_item_id TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  source_type TEXT,
  source_id TEXT,
  approval_request_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_exceptions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT,
  outlet_id TEXT,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_item_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  file_key TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  generated_by TEXT,
  generated_at TEXT NOT NULL,
  downloaded_at TEXT
);

CREATE TABLE IF NOT EXISTS advance_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_date TEXT NOT NULL,
  deduction_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approval_request_id TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_loans (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  loan_amount INTEGER NOT NULL,
  installment_amount INTEGER NOT NULL,
  outstanding_amount INTEGER NOT NULL,
  start_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approval_request_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_loan_installments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  salary_loan_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  payroll_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
