import { api } from "@/lib/api-client";
import type { Pagination } from "@/types/api";

export interface AuditLog {
  id: string;
  module: string;
  action: string;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
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
  page?: number;
  page_size?: number;
}

const query = (filters: AuditLogFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
};

export const auditLogsApi = {
  list: (filters: AuditLogFilters = {}) =>
    api.get<AuditLog[]>(`/audit-logs?${query(filters)}`) as Promise<{ success: true; data: AuditLog[]; pagination?: Pagination; message?: string }>,
  detail: (id: string) => api.get<{ audit_log: AuditLog }>(`/audit-logs/${id}`),
};
