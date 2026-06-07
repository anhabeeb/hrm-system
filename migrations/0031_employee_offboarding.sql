CREATE TABLE IF NOT EXISTS employee_offboarding_cases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  offboarding_type TEXT NOT NULL,
  effective_exit_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  initiated_by TEXT,
  initiated_at TEXT NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  final_settlement_status TEXT NOT NULL DEFAULT 'not_prepared',
  final_settlement_payroll_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_offboarding_tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  offboarding_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  required INTEGER NOT NULL DEFAULT 1,
  due_date TEXT,
  completed_by TEXT,
  completed_at TEXT,
  notes TEXT,
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, offboarding_case_id, task_type, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS employee_final_settlement_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  offboarding_case_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  basic_salary_due INTEGER NOT NULL DEFAULT 0,
  allowances_due INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_deductions INTEGER NOT NULL DEFAULT 0,
  attendance_deductions INTEGER NOT NULL DEFAULT 0,
  advances_outstanding INTEGER NOT NULL DEFAULT 0,
  loans_outstanding INTEGER NOT NULL DEFAULT 0,
  asset_deductions INTEGER NOT NULL DEFAULT 0,
  uniform_deductions INTEGER NOT NULL DEFAULT 0,
  leave_encashment INTEGER NOT NULL DEFAULT 0,
  gratuity_or_service_benefit INTEGER NOT NULL DEFAULT 0,
  other_earnings INTEGER NOT NULL DEFAULT 0,
  other_deductions INTEGER NOT NULL DEFAULT 0,
  estimated_net_settlement INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MVR',
  calculation_metadata_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, offboarding_case_id)
);

CREATE INDEX IF NOT EXISTS idx_offboarding_cases_company_employee_status
  ON employee_offboarding_cases(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_offboarding_cases_company_status_exit
  ON employee_offboarding_cases(company_id, status, effective_exit_date);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_case_status
  ON employee_offboarding_tasks(company_id, offboarding_case_id, status);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_employee_type
  ON employee_offboarding_tasks(company_id, employee_id, task_type);

CREATE INDEX IF NOT EXISTS idx_final_settlement_drafts_case
  ON employee_final_settlement_drafts(company_id, offboarding_case_id);
