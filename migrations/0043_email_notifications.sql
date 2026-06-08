-- Phase 10B - Email Notifications
-- Additive only: stores retryable email jobs, user email preferences, safe settings, and optional templates.
-- Email job statuses include: pending, queued, sent, failed, skipped_preference,
-- skipped_no_email, skipped_disabled, skipped_config_missing, duplicate.

CREATE TABLE IF NOT EXISTS email_notifications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  in_app_notification_id TEXT,
  recipient_user_id TEXT,
  recipient_employee_id TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  notification_type TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT,
  template_key TEXT,
  template_version TEXT,
  entity_type TEXT,
  entity_id TEXT,
  event_key TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  sent_at TEXT,
  failed_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  FOREIGN KEY (in_app_notification_id) REFERENCES notifications(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_notifications_company_idempotency
  ON email_notifications(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_notifications_company_status_created
  ON email_notifications(company_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_email_notifications_company_user_created
  ON email_notifications(company_id, recipient_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_notifications_company_email_created
  ON email_notifications(company_id, recipient_email, created_at);

CREATE INDEX IF NOT EXISTS idx_email_notifications_company_entity
  ON email_notifications(company_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_email_notifications_company_category_status_created
  ON email_notifications(company_id, category, status, created_at);

CREATE TABLE IF NOT EXISTS email_notification_preferences (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  minimum_priority_for_email TEXT NOT NULL DEFAULT 'normal',
  muted_until TEXT,
  digest_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id, category),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_email_notification_preferences_company_user_category
  ON email_notification_preferences(company_id, user_id, category);

CREATE TABLE IF NOT EXISTS email_notification_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  provider_name TEXT,
  allowed_categories_json TEXT,
  minimum_priority TEXT NOT NULL DEFAULT 'normal',
  send_immediately INTEGER NOT NULL DEFAULT 0,
  admin_failure_notifications INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  template_key TEXT NOT NULL,
  template_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  text_template TEXT NOT NULL,
  html_template TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  locale TEXT,
  version TEXT NOT NULL DEFAULT '1',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, template_key, version)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_company_key
  ON email_templates(company_id, template_key);

CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  email_notification_id TEXT,
  status TEXT NOT NULL,
  provider TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (email_notification_id) REFERENCES email_notifications(id)
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_company_notification
  ON email_delivery_logs(company_id, email_notification_id);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_company_status_created
  ON email_delivery_logs(company_id, status, created_at);
