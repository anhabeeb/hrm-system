ALTER TABLE approval_requests
ADD COLUMN applied_at TEXT;

ALTER TABLE approval_requests
ADD COLUMN failure_code TEXT;

ALTER TABLE approval_requests
ADD COLUMN failure_message TEXT;

ALTER TABLE approval_requests
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE approval_requests
ADD COLUMN last_retry_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_actions_unique_final_apply
  ON approval_actions(approval_request_id, action)
  WHERE action = 'applied';
