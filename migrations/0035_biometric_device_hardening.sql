ALTER TABLE biometric_devices ADD COLUMN device_code TEXT;
ALTER TABLE biometric_devices ADD COLUMN external_device_id TEXT;
ALTER TABLE biometric_devices ADD COLUMN vendor TEXT;
ALTER TABLE biometric_devices ADD COLUMN model TEXT;
ALTER TABLE biometric_devices ADD COLUMN created_by TEXT;
ALTER TABLE biometric_devices ADD COLUMN updated_by TEXT;
ALTER TABLE biometric_devices ADD COLUMN revoked_by TEXT;
ALTER TABLE biometric_devices ADD COLUMN revoked_at TEXT;
ALTER TABLE biometric_devices ADD COLUMN revoke_reason TEXT;

ALTER TABLE biometric_attendance_logs ADD COLUMN source_event_id TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN device_timestamp TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN attendance_event_id TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN resolved_by TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN resolved_at TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN resolution_reason TEXT;

ALTER TABLE attendance_events ADD COLUMN source_device_id TEXT;
ALTER TABLE attendance_events ADD COLUMN source_event_id TEXT;
ALTER TABLE attendance_events ADD COLUMN metadata_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_devices_company_external_device_id
  ON biometric_devices(company_id, external_device_id)
  WHERE external_device_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_devices_company_device_code
  ON biometric_devices(company_id, device_code)
  WHERE device_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biometric_devices_company_status
  ON biometric_devices(company_id, status);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_company_status
  ON biometric_attendance_logs(company_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_company_employee_time
  ON biometric_attendance_logs(company_id, employee_id, event_time);
