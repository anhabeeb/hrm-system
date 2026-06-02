import type { Pagination } from "@/types/api";

export interface BiometricDevice {
  id: string;
  outlet_id?: string;
  outlet_name?: string;
  device_name?: string;
  device_serial?: string;
  device_type?: string;
  vendor?: string;
  model?: string;
  sync_mode?: string;
  status: string;
  last_seen_at?: string | null;
  last_sync_at?: string | null;
  health_status?: string | null;
}

export interface BiometricMapping {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  device_id?: string;
  device_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  biometric_user_id: string;
  enrollment_status?: string;
  is_active?: boolean | number;
  confidence?: number;
}

export interface BiometricLog {
  id: string;
  device_id?: string;
  device_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  employee_id?: string | null;
  employee_name?: string | null;
  biometric_user_id: string;
  event_type: string;
  event_time: string;
  match_status?: string;
  sync_status?: string;
  status?: string;
  reason?: string;
  raw_payload_json?: unknown;
}

export interface BiometricFilters {
  outlet_id?: string;
  device_id?: string;
  employee_id?: string;
  biometric_user_id?: string;
  event_type?: string;
  sync_status?: string;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface BiometricDevicePayload {
  outlet_id: string;
  device_name: string;
  device_serial?: string;
  device_type: string;
  sync_mode?: string;
  reason?: string;
}

export interface BiometricMappingPayload {
  employee_id: string;
  device_id: string;
  biometric_user_id: string;
  enrollment_status?: string;
  reason?: string;
}

export interface BiometricReasonPayload {
  reason: string;
  employee_id?: string;
}

export interface BiometricMutationResult {
  device?: BiometricDevice;
  mapping?: BiometricMapping;
  token?: string;
  device_token?: string;
  raw_token?: string;
  updated?: boolean;
}

export interface PaginatedBiometricResult<T> {
  data: T[];
  pagination?: Pagination;
}
