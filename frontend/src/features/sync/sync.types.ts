import type { Pagination } from "@/types/api";

export interface SyncStatusSummary {
  pending_count?: number;
  failed_count?: number;
  conflict_count?: number;
  last_push_at?: string | null;
  last_pull_at?: string | null;
  last_sync_token?: number;
  devices_online_count?: number;
  devices_warning_count?: number;
}

export interface SyncBatch {
  id: string;
  batch_id?: string;
  outlet_id?: string;
  outlet_name?: string;
  device_id?: string;
  device_name?: string;
  status: string;
  started_at?: string;
  completed_at?: string | null;
  created_at?: string;
  pending_count?: number;
  failed_count?: number;
  conflict_count?: number;
}

export interface SyncConflict {
  id: string;
  conflict_type: string;
  entity_type?: string;
  outlet_id?: string;
  outlet_name?: string;
  device_id?: string;
  device_name?: string;
  employee_id?: string;
  status: string;
  severity?: string;
  local_payload_json?: unknown;
  server_payload_json?: unknown;
  created_at?: string;
}

export interface SyncFilters {
  status?: string;
  conflict_type?: string;
  entity_type?: string;
  employee_id?: string;
  outlet_id?: string;
  device_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface SyncReasonPayload {
  reason: string;
  resolution?: "accept" | "reject" | "merge" | "ignore";
  resolution_notes?: string;
  device_id?: string;
  outlet_id?: string;
}

export interface PaginatedSyncResult<T> {
  data: T[];
  pagination?: Pagination;
}
