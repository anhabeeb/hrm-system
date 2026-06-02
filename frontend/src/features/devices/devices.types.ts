import type { Pagination } from "@/types/api";

export interface DeviceRecord {
  id: string;
  outlet_id?: string;
  outlet_name?: string;
  device_name?: string;
  name?: string;
  device_type?: string;
  status: string;
  last_seen_at?: string | null;
  last_sync_at?: string | null;
  health_status?: string | null;
  pending_count?: number;
  failed_count?: number;
  conflict_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DeviceHealthLog {
  id: string;
  device_id: string;
  health_status: string;
  pending_count?: number;
  failed_count?: number;
  conflict_count?: number;
  battery_level?: number | null;
  app_version?: string | null;
  network_status?: string | null;
  created_at?: string;
}

export interface DeviceFilters {
  search?: string;
  outlet_id?: string;
  device_type?: string;
  status?: string;
  health_status?: string;
  page?: number;
  page_size?: number;
}

export interface RegisterDevicePayload {
  device_name: string;
  outlet_id: string;
  device_type: string;
  description?: string;
  allowed_ip?: string;
  reason?: string;
}

export interface DeviceReasonPayload {
  reason: string;
}

export interface DeviceMutationResult {
  device?: DeviceRecord;
  device_token?: string;
  token?: string;
  raw_token?: string;
  updated?: boolean;
}

export interface PaginatedDeviceResult<T> {
  data: T[];
  pagination?: Pagination;
}
