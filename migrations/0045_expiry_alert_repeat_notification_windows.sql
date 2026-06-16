-- Phase 10C final hardening - repeat notification windows.
-- Additive only: existing expiry alerts keep history and receive last_notified_at on the next successful delivery.

ALTER TABLE expiry_alerts ADD COLUMN last_notified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_expiry_alerts_company_last_notified
  ON expiry_alerts(company_id, last_notified_at);
