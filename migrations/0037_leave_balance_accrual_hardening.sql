-- Phase 9A: Leave balance / accrual hardening.
-- Additive only. Existing leave_balances.year / remaining_days remain for compatibility.

ALTER TABLE leave_types ADD COLUMN requires_balance INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leave_types ADD COLUMN allow_negative_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN max_negative_balance REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN accrual_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN accrual_frequency TEXT NOT NULL DEFAULT 'none';
ALTER TABLE leave_types ADD COLUMN annual_entitlement_days REAL;
ALTER TABLE leave_types ADD COLUMN accrual_amount REAL;
ALTER TABLE leave_types ADD COLUMN prorate_on_joining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN prorate_on_termination INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN carry_forward_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN carry_forward_limit_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN carry_forward_expiry_month INTEGER;
ALTER TABLE leave_types ADD COLUMN carry_forward_expiry_day INTEGER;
ALTER TABLE leave_types ADD COLUMN half_day_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leave_types ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0;

ALTER TABLE leave_balances ADD COLUMN pending_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN adjusted_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN carried_forward_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN expired_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN available_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN entitlement_days REAL NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN policy_year INTEGER;
ALTER TABLE leave_balances ADD COLUMN accrual_period_start TEXT;
ALTER TABLE leave_balances ADD COLUMN accrual_period_end TEXT;
ALTER TABLE leave_balances ADD COLUMN last_accrual_date TEXT;
ALTER TABLE leave_balances ADD COLUMN next_accrual_date TEXT;
ALTER TABLE leave_balances ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE leave_balances ADD COLUMN created_at TEXT;

UPDATE leave_balances
SET
  policy_year = COALESCE(policy_year, year),
  entitlement_days = COALESCE(NULLIF(entitlement_days, 0), opening_balance + accrued_days),
  available_days = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days,
  created_at = COALESCE(created_at, updated_at)
WHERE policy_year IS NULL OR available_days = 0 OR created_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_balance_transactions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  balance_id TEXT NOT NULL,
  leave_request_id TEXT,
  transaction_type TEXT NOT NULL,
  quantity_days REAL NOT NULL,
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
  effective_date TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  idempotency_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_company_employee_type_year
  ON leave_balances(company_id, employee_id, leave_type_id, year);

CREATE INDEX IF NOT EXISTS idx_leave_balances_company_type_year
  ON leave_balances(company_id, leave_type_id, year);

CREATE INDEX IF NOT EXISTS idx_leave_balance_tx_company_employee_type_effective
  ON leave_balance_transactions(company_id, employee_id, leave_type_id, effective_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_balance_tx_company_idempotency
  ON leave_balance_transactions(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_employee_type_status
  ON leave_requests(company_id, employee_id, leave_type_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_dates
  ON leave_requests(company_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_employees_company_outlet_leave_balance
  ON employees(company_id, primary_outlet_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_department_leave_balance
  ON employees(company_id, department_id);
