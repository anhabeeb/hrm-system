CREATE INDEX IF NOT EXISTS idx_attendance_events_company_source_device_time
  ON attendance_events(company_id, source_device_id, event_time);

CREATE INDEX IF NOT EXISTS idx_attendance_events_company_employee_event_time
  ON attendance_events(company_id, employee_id, event_time);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_company_device_timestamp
  ON biometric_attendance_logs(company_id, device_id, device_timestamp);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_company_status_timestamp
  ON biometric_attendance_logs(company_id, sync_status, device_timestamp);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_company_employee_status
  ON attendance_corrections(company_id, employee_id, status);

