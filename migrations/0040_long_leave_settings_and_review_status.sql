-- Phase 9C follow-up: long leave settings and safe payroll review semantics.
-- Additive only; keeps existing long leave and payroll impact data intact.

ALTER TABLE long_leave_settings ADD COLUMN default_salary_treatment TEXT DEFAULT 'unpaid';
ALTER TABLE long_leave_settings ADD COLUMN default_deduction_method TEXT DEFAULT 'calendar_days';
ALTER TABLE long_leave_settings ADD COLUMN require_payroll_review INTEGER NOT NULL DEFAULT 1;
ALTER TABLE long_leave_settings ADD COLUMN require_return_to_work_confirmation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE long_leave_settings ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 1;
ALTER TABLE long_leave_settings ADD COLUMN partial_pay_ratio REAL NOT NULL DEFAULT 0.5;

UPDATE long_leave_payroll_impacts
SET status = 'pending_review',
    updated_at = CURRENT_TIMESTAMP,
    notes = COALESCE(notes, 'Payroll impact is stored for review; no payroll run was mutated.')
WHERE status = 'applied'
  AND payroll_run_id IS NULL
  AND payroll_adjustment_id IS NULL;

UPDATE long_leave_records
SET payroll_status = 'pending_review',
    updated_at = CURRENT_TIMESTAMP
WHERE payroll_status = 'payroll_adjusted'
  AND NOT EXISTS (
    SELECT 1
    FROM long_leave_payroll_impacts i
    WHERE i.company_id = long_leave_records.company_id
      AND i.long_leave_id = long_leave_records.id
      AND i.payroll_adjustment_id IS NOT NULL
  );
