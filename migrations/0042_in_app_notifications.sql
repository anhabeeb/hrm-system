-- Phase 10A: In-app notification hardening.
-- Additive only; preserves the legacy notifications.user_id/is_read model while
-- adding per-recipient status, preferences, delivery logs, and idempotency.

ALTER TABLE notifications ADD COLUMN recipient_user_id TEXT;
ALTER TABLE notifications ADD COLUMN recipient_employee_id TEXT;
ALTER TABLE notifications ADD COLUMN recipient_role_key TEXT;
ALTER TABLE notifications ADD COLUMN recipient_permission_key TEXT;
ALTER TABLE notifications ADD COLUMN department_id TEXT;
ALTER TABLE notifications ADD COLUMN category TEXT NOT NULL DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN action_url TEXT;
ALTER TABLE notifications ADD COLUMN action_label TEXT;
ALTER TABLE notifications ADD COLUMN event_key TEXT;
ALTER TABLE notifications ADD COLUMN idempotency_key TEXT;
ALTER TABLE notifications ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';
ALTER TABLE notifications ADD COLUMN archived_at TEXT;
ALTER TABLE notifications ADD COLUMN dismissed_at TEXT;
ALTER TABLE notifications ADD COLUMN created_by TEXT;
ALTER TABLE notifications ADD COLUMN expires_at TEXT;
ALTER TABLE notifications ADD COLUMN metadata_json TEXT;
ALTER TABLE notifications ADD COLUMN updated_at TEXT;

UPDATE notifications
SET
  recipient_user_id = COALESCE(recipient_user_id, user_id),
  status = CASE WHEN is_read = 1 THEN 'read' ELSE COALESCE(status, 'unread') END,
  category = COALESCE(category, 'system'),
  updated_at = COALESCE(updated_at, created_at)
WHERE recipient_user_id IS NULL OR updated_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  minimum_priority TEXT NOT NULL DEFAULT 'low',
  muted_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, user_id, category)
);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  notification_id TEXT,
  recipient_user_id TEXT,
  event_key TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_company_idempotency
  ON notifications(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_company_recipient_status_created
  ON notifications(company_id, recipient_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_company_recipient_category_created
  ON notifications(company_id, recipient_user_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_company_recipient_priority_created
  ON notifications(company_id, recipient_user_id, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_company_entity
  ON notifications(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_company_user_category
  ON notification_preferences(company_id, user_id, category);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_company_notification
  ON notification_delivery_logs(company_id, notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_company_recipient_created
  ON notification_delivery_logs(company_id, recipient_user_id, created_at);
