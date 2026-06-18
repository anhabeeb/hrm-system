CREATE TABLE IF NOT EXISTS leave_type_policy_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  leave_type_key TEXT,
  annual_entitlement_days REAL,
  paid_status TEXT NOT NULL DEFAULT 'paid',
  paid_percentage REAL NOT NULL DEFAULT 100,
  payroll_impact_enabled INTEGER NOT NULL DEFAULT 1,
  document_requirement TEXT NOT NULL DEFAULT 'never',
  document_required_mode TEXT NOT NULL DEFAULT 'never',
  document_after_days REAL,
  document_required_after_consecutive_days REAL,
  document_after_used_days REAL,
  document_required_after_used_days REAL,
  allow_no_document_until_used_days REAL,
  require_document_for_backdated_request INTEGER NOT NULL DEFAULT 0,
  require_document_for_extension INTEGER NOT NULL DEFAULT 0,
  approval_required INTEGER NOT NULL DEFAULT 1,
  approval_workflow_key TEXT,
  salary_deduction_enabled INTEGER NOT NULL DEFAULT 0,
  deduction_mode TEXT NOT NULL DEFAULT 'none',
  deduction_component TEXT NOT NULL DEFAULT 'leave_policy',
  deduction_component_keys_json TEXT,
  deduction_pay_component_keys TEXT,
  deduction_daily_rate_method TEXT NOT NULL DEFAULT 'payroll_working_days',
  deduction_custom_divisor REAL,
  payroll_source_label TEXT,
  allow_half_day INTEGER NOT NULL DEFAULT 0,
  allow_carry_forward INTEGER NOT NULL DEFAULT 0,
  carry_forward_limit_days REAL,
  reset_period TEXT NOT NULL DEFAULT 'calendar_year',
  count_weekends INTEGER NOT NULL DEFAULT 0,
  count_public_holidays INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(company_id, leave_type_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_type_policy_rules_company
  ON leave_type_policy_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_leave_type_policy_rules_leave_type
  ON leave_type_policy_rules(company_id, leave_type_id);

INSERT OR IGNORE INTO leave_type_policy_rules (
  id,
  company_id,
  leave_type_id,
  leave_type_key,
  annual_entitlement_days,
  paid_status,
  paid_percentage,
  payroll_impact_enabled,
  document_requirement,
  document_required_mode,
  document_after_days,
  document_required_after_consecutive_days,
  document_after_used_days,
  document_required_after_used_days,
  allow_no_document_until_used_days,
  require_document_for_backdated_request,
  require_document_for_extension,
  approval_required,
  approval_workflow_key,
  salary_deduction_enabled,
  deduction_mode,
  deduction_component,
  deduction_component_keys_json,
  deduction_pay_component_keys,
  deduction_daily_rate_method,
  deduction_custom_divisor,
  payroll_source_label,
  allow_half_day,
  allow_carry_forward,
  carry_forward_limit_days,
  reset_period,
  count_weekends,
  count_public_holidays,
  notes,
  is_enabled,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  lt.company_id || '_leave_policy_rule_' || lt.id,
  lt.company_id,
  lt.id,
  lt.leave_key,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 10
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 30
    ELSE lt.annual_entitlement_days
  END,
  CASE
    WHEN lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 'unpaid'
    ELSE 'paid'
  END,
  CASE
    WHEN lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 0
    ELSE 100
  END,
  CASE
    WHEN lt.affects_payroll = 1 OR lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 1
    ELSE 0
  END,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 'after_consecutive_days'
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 'after_consecutive_or_used_days'
    WHEN lt.requires_attachment = 1 THEN 'always'
    ELSE 'never'
  END,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 'after_consecutive_days'
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 'after_consecutive_or_used_days'
    WHEN lt.requires_attachment = 1 THEN 'always'
    ELSE 'never'
  END,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 2
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 2
    ELSE NULL
  END,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 2
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 2
    ELSE NULL
  END,
  CASE
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 15
    ELSE NULL
  END,
  CASE
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 15
    ELSE NULL
  END,
  CASE
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 15
    ELSE NULL
  END,
  0,
  0,
  1,
  'leave_request',
  CASE
    WHEN lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 1
    ELSE 0
  END,
  CASE
    WHEN lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 'basic_salary'
    ELSE 'none'
  END,
  'leave_policy',
  NULL,
  NULL,
  'payroll_working_days',
  NULL,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 'family_responsibility_leave_policy'
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 'sick_leave_policy'
    WHEN lt.is_paid = 0 OR lower(lt.leave_key) LIKE '%unpaid%' OR lower(lt.leave_name) LIKE '%unpaid%' THEN 'unpaid_leave_policy'
    ELSE 'leave_policy'
  END,
  0,
  COALESCE(lt.carry_forward_enabled, 0),
  lt.carry_forward_limit_days,
  'calendar_year',
  0,
  0,
  CASE
    WHEN lower(lt.leave_key) IN ('frl', 'family_responsibility_leave') OR lower(lt.leave_name) LIKE '%family responsibility%' THEN 'Paid leave. No salary deduction. Documents are required only when a request exceeds 2 consecutive days.'
    WHEN lower(lt.leave_key) LIKE '%sick%' OR lower(lt.leave_name) LIKE '%sick%' THEN 'Paid leave. First 15 used sick leave days can be submitted without documents if each request is 2 consecutive days or less.'
    ELSE NULL
  END,
  1,
  COALESCE(lt.updated_at, lt.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(lt.updated_at, lt.created_at, '2026-01-01T00:00:00Z'),
  NULL,
  NULL
FROM leave_types lt;
