-- Employee profile picture metadata.
-- Photos are stored in R2; D1 stores only private object references and audit metadata.

ALTER TABLE employees ADD COLUMN profile_photo_key TEXT;
ALTER TABLE employees ADD COLUMN profile_photo_updated_at TEXT;
ALTER TABLE employees ADD COLUMN profile_photo_uploaded_by TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_profile_photo_uploaded_by
  ON employees(company_id, profile_photo_uploaded_by);

