ALTER TABLE approval_requests
ADD COLUMN applying_started_at TEXT;

UPDATE company_settings
SET setting_value_json = json_set(
      COALESCE(setting_value_json, '{}'),
      '$.approval_applying_recovery_minutes',
      COALESCE(json_extract(setting_value_json, '$.approval_applying_recovery_minutes'), 5)
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'approvals.salary_rules';
