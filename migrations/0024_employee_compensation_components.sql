-- Phase 5D: recurring employee compensation components.
-- Forward-only migration. Do not drop or recreate salary/payroll history tables.

CREATE TABLE IF NOT EXISTS compensation_component_definitions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN ('allowance', 'benefit', 'deduction')),
  component_code TEXT NOT NULL,
  component_name TEXT NOT NULL,
  category TEXT,
  default_amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'MVR',
  calculation_type TEXT NOT NULL DEFAULT 'fixed_amount' CHECK (calculation_type IN ('fixed_amount', 'percentage_of_basic_salary', 'non_cash_benefit')),
  affects_gross_pay INTEGER NOT NULL DEFAULT 1,
  affects_net_pay INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compensation_definitions_company_code
  ON compensation_component_definitions(company_id, component_code);

CREATE INDEX IF NOT EXISTS idx_compensation_definitions_company_type_status
  ON compensation_component_definitions(company_id, component_type, status);

CREATE TABLE IF NOT EXISTS employee_compensation_components (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  component_definition_id TEXT,
  component_type TEXT NOT NULL CHECK (component_type IN ('allowance', 'benefit', 'deduction')),
  component_code TEXT,
  component_name TEXT NOT NULL,
  category TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MVR',
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed_amount', 'percentage_of_basic_salary', 'non_cash_benefit')),
  affects_gross_pay INTEGER NOT NULL DEFAULT 1,
  affects_net_pay INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'ended', 'cancelled', 'pending_approval')),
  reason TEXT NOT NULL,
  notes TEXT,
  approval_request_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (component_definition_id) REFERENCES compensation_component_definitions(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_employee_status
  ON employee_compensation_components(company_id, employee_id, component_type, status);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_effective_range
  ON employee_compensation_components(company_id, employee_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_definition
  ON employee_compensation_components(company_id, employee_id, component_definition_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_employee_comp_components_code
  ON employee_compensation_components(company_id, employee_id, component_type, component_code, effective_from, effective_to);
