export interface AuditLogRecord {
  id: string;
  company_id: string;
  outlet_id: string | null;
  module: string;
  action: string;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  actor_user_id: string | null;
  actor_role_id: string | null;
  device_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  old_value_json: string | null;
  new_value_json: string | null;
  reason: string | null;
  effective_date: string | null;
  approval_request_id: string | null;
  sync_batch_id: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  date_from?: string;
  date_to?: string;
  actor_user_id?: string;
  module?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  request_id?: string;
  severity?: string;
  page: number;
  page_size: number;
}
