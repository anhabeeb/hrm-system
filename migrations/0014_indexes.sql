CREATE INDEX IF NOT EXISTS idx_employees_company_employment_status
  ON employees(company_id, employment_status);

CREATE INDEX IF NOT EXISTS idx_employees_company_primary_outlet
  ON employees(company_id, primary_outlet_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_employee_type
  ON employees(company_id, employee_type);

CREATE INDEX IF NOT EXISTS idx_employees_company_department
  ON employees(company_id, department_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_position
  ON employees(company_id, position_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_full_name
  ON employees(company_id, full_name);

CREATE INDEX IF NOT EXISTS idx_users_company_status
  ON users(company_id, status);

CREATE INDEX IF NOT EXISTS idx_users_company_email
  ON users(company_id, email);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_company_employee_date
  ON attendance_daily_summary(company_id, employee_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_company_outlet_date
  ON attendance_daily_summary(company_id, outlet_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_events_company_event_time
  ON attendance_events(company_id, event_time);

CREATE INDEX IF NOT EXISTS idx_attendance_events_company_sync_status
  ON attendance_events(company_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_employee_dates
  ON leave_requests(company_id, employee_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_status
  ON leave_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_leave_type
  ON leave_requests(company_id, leave_type_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_month
  ON payroll_runs(company_id, payroll_month);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_status
  ON payroll_runs(company_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_items_company_employee
  ON payroll_items(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run_employee
  ON payroll_items(payroll_run_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_expiry_date
  ON employee_documents(company_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_employee
  ON employee_documents(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_documents_company_status
  ON employee_documents(company_id, status);

CREATE INDEX IF NOT EXISTS idx_assets_company_status
  ON assets(company_id, status);

CREATE INDEX IF NOT EXISTS idx_assets_company_outlet
  ON assets(company_id, outlet_id);

CREATE INDEX IF NOT EXISTS idx_assets_company_asset_code
  ON assets(company_id, asset_code);

CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status
  ON approval_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_requests_company_module
  ON approval_requests(company_id, module);

CREATE INDEX IF NOT EXISTS idx_approval_requests_company_employee
  ON approval_requests(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_sync_changes_company_outlet_version
  ON sync_changes(company_id, outlet_id, change_version);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_company_status
  ON sync_conflicts(company_id, status);

CREATE INDEX IF NOT EXISTS idx_device_sync_state_company_device
  ON device_sync_state(company_id, device_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created_at
  ON audit_logs(company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_module_action
  ON audit_logs(company_id, module, action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_employee
  ON audit_logs(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_actor_user
  ON audit_logs(company_id, actor_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_company_user_read
  ON notifications(company_id, user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_company_created_at
  ON notifications(company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profile_update_requests_company_user_status
  ON user_profile_update_requests(company_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_profile_update_requests_company_employee_status
  ON user_profile_update_requests(company_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_profile_update_requests_company_status_created
  ON user_profile_update_requests(company_id, status, created_at);
