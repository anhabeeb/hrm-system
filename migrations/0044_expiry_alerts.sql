-- Phase 10C - Expiry Alerts
-- Additive only: stores deterministic expiry alert findings, scan settings, and idempotency metadata.

CREATE TABLE IF NOT EXISTS expiry_alerts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  user_id TEXT,
  outlet_id TEXT,
  department_id TEXT,
  source_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  days_until_expiry INTEGER NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  notification_id TEXT,
  email_notification_id TEXT,
  idempotency_key TEXT NOT NULL,
  first_detected_at TEXT NOT NULL,
  last_detected_at TEXT NOT NULL,
  next_notification_at TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  dismissed_by TEXT,
  dismissed_at TEXT,
  snoozed_until TEXT,
  resolution_note TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id),
  FOREIGN KEY (email_notification_id) REFERENCES email_notifications(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expiry_alerts_company_idempotency
  ON expiry_alerts(company_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_status_severity_expiry
  ON expiry_alerts(company_id, status, severity, expiry_date);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_source
  ON expiry_alerts(company_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_employee_expiry
  ON expiry_alerts(company_id, employee_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_outlet_expiry
  ON expiry_alerts(company_id, outlet_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_department_expiry
  ON expiry_alerts(company_id, department_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_next_notification
  ON expiry_alerts(company_id, status, next_notification_at);

CREATE TABLE IF NOT EXISTS expiry_alert_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  warning_days_json TEXT NOT NULL DEFAULT '[90,60,30,14,7,1]',
  overdue_enabled INTEGER NOT NULL DEFAULT 1,
  repeat_frequency TEXT NOT NULL DEFAULT 'weekly',
  quiet_days INTEGER NOT NULL DEFAULT 7,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  minimum_email_severity TEXT NOT NULL DEFAULT 'high',
  notify_roles_json TEXT NOT NULL DEFAULT '["hr_admin","admin","super_admin"]',
  notify_permissions_json TEXT NOT NULL DEFAULT '["expiry_alerts.manage","expiry_alerts.view"]',
  notify_employee_self INTEGER NOT NULL DEFAULT 0,
  fallback_to_admins INTEGER NOT NULL DEFAULT 1,
  include_archived_employees INTEGER NOT NULL DEFAULT 0,
  include_inactive_employees INTEGER NOT NULL DEFAULT 0,
  source_toggles_json TEXT NOT NULL DEFAULT '{"employee_documents":true,"employee_passport":true,"employee_work_permit":true,"contracts":true,"probation":true,"long_leave_return":true,"assets":false,"uniforms":false}',
  updated_by TEXT,
  updated_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_expiry_alert_settings_company
  ON expiry_alert_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_passport_expiry
  ON employees(company_id, passport_expiry_date);

CREATE INDEX IF NOT EXISTS idx_employees_company_work_permit_expiry
  ON employees(company_id, work_permit_expiry_date);

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_expiry
  ON employee_documents(company_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_probation_end
  ON employee_contracts(company_id, probation_end_date);

CREATE INDEX IF NOT EXISTS idx_long_leave_records_company_expected_return
  ON long_leave_records(company_id, expected_return_date);
