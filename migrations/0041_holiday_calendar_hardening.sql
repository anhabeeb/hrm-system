-- Phase 9D: Holiday Calendar hardening.
-- Additive only: preserve legacy holidays/holiday_outlets records and keep
-- legacy column names populated for existing attendance, roster, and leave hooks.

ALTER TABLE holidays ADD COLUMN code TEXT;
ALTER TABLE holidays ADD COLUMN name TEXT;
ALTER TABLE holidays ADD COLUMN date TEXT;
ALTER TABLE holidays ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE holidays ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE holidays ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holidays ADD COLUMN recurrence_rule TEXT;
ALTER TABLE holidays ADD COLUMN recurrence_month INTEGER;
ALTER TABLE holidays ADD COLUMN recurrence_day INTEGER;
ALTER TABLE holidays ADD COLUMN outlet_id TEXT;
ALTER TABLE holidays ADD COLUMN department_id TEXT;
ALTER TABLE holidays ADD COLUMN applies_to_all_outlets INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN applies_to_local_employees INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN applies_to_foreign_employees INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN paid_holiday INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN counts_as_working_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holidays ADD COLUMN affects_leave_duration INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN affects_attendance_absence INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN affects_overtime INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN affects_long_leave_payroll INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD COLUMN requires_work_pay_rate_multiplier REAL;
ALTER TABLE holidays ADD COLUMN notes TEXT;
ALTER TABLE holidays ADD COLUMN archived_by TEXT;
ALTER TABLE holidays ADD COLUMN archived_at TEXT;
ALTER TABLE holidays ADD COLUMN archive_reason TEXT;

UPDATE holidays
SET
  name = COALESCE(name, holiday_name),
  date = COALESCE(date, start_date),
  paid_holiday = COALESCE(paid_holiday, is_paid, 1),
  is_recurring = COALESCE(is_recurring, repeat_yearly, 0),
  recurrence_month = COALESCE(recurrence_month, CAST(strftime('%m', start_date) AS INTEGER)),
  recurrence_day = COALESCE(recurrence_day, CAST(strftime('%d', start_date) AS INTEGER)),
  affects_leave_duration = COALESCE(affects_leave_duration, affects_leave, 1),
  affects_attendance_absence = COALESCE(affects_attendance_absence, affects_attendance, 1),
  affects_long_leave_payroll = COALESCE(affects_long_leave_payroll, affects_payroll, 1),
  status = CASE WHEN is_enabled = 1 THEN COALESCE(status, 'active') ELSE 'inactive' END,
  applies_to_all_outlets = CASE
    WHEN EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = holidays.company_id AND ho.holiday_id = holidays.id) THEN 0
    ELSE COALESCE(applies_to_all_outlets, 1)
  END;

ALTER TABLE holiday_settings ADD COLUMN optional_holidays_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN exclude_holidays_from_paid_leave INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN exclude_holidays_from_unpaid_leave INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holiday_settings ADD COLUMN holidays_count_as_attendance_excused INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN holiday_work_overtime_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN replacement_holidays_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holiday_settings ADD COLUMN holiday_import_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN holiday_approval_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holiday_settings ADD COLUMN require_reason_for_holiday_changes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE holiday_settings ADD COLUMN default_holiday_pay_multiplier REAL NOT NULL DEFAULT 1.5;

CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_company_code_unique
  ON holidays(company_id, code)
  WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holidays_company_date ON holidays(company_id, date);
CREATE INDEX IF NOT EXISTS idx_holidays_company_start_end ON holidays(company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_holidays_company_type_status ON holidays(company_id, holiday_type, status);
CREATE INDEX IF NOT EXISTS idx_holidays_company_outlet_date ON holidays(company_id, outlet_id, date);
CREATE INDEX IF NOT EXISTS idx_holidays_company_recurring ON holidays(company_id, is_recurring);
CREATE INDEX IF NOT EXISTS idx_holiday_settings_company ON holiday_settings(company_id);
