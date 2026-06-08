-- Phase 11A: Dashboard Completion and Employee 360 Profile.
-- Additive only: indexes support date-bounded dashboard widgets and employee-scoped profile tabs.

CREATE INDEX IF NOT EXISTS idx_dashboard_attendance_company_date
  ON attendance_daily_summary(company_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_dashboard_attendance_company_employee_date
  ON attendance_daily_summary(company_id, employee_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_dashboard_leave_requests_company_employee_status
  ON leave_requests(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_dashboard_leave_balances_company_employee
  ON leave_balances(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_long_leave_company_employee_status
  ON long_leave_records(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_dashboard_expiry_company_employee_status_expiry
  ON expiry_alerts(company_id, employee_id, status, expiry_date);

CREATE INDEX IF NOT EXISTS idx_dashboard_notifications_company_recipient_status_created
  ON notifications(company_id, recipient_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_email_notifications_company_status_created
  ON email_notifications(company_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_biometric_logs_company_status_created
  ON biometric_attendance_logs(company_id, sync_status, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_employees_company_outlet
  ON employees(company_id, primary_outlet_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_employees_company_department
  ON employees(company_id, department_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_employee_documents_company_employee_expiry
  ON employee_documents(company_id, employee_id, expiry_date);
