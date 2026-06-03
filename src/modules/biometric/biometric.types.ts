import type {
  BIOMETRIC_DEVICE_TYPES,
  BIOMETRIC_EVENT_TYPES,
  BIOMETRIC_SYNC_MODES,
  BIOMETRIC_VERIFICATION_METHODS,
} from "./biometric.constants";

export type BiometricEventType = (typeof BIOMETRIC_EVENT_TYPES)[number];
export type BiometricVerificationMethod = (typeof BIOMETRIC_VERIFICATION_METHODS)[number];
export type BiometricDeviceType = (typeof BIOMETRIC_DEVICE_TYPES)[number];
export type BiometricSyncMode = (typeof BIOMETRIC_SYNC_MODES)[number];

export interface BiometricPunchInput {
  biometric_user_id: string;
  event_time: string;
  event_type: BiometricEventType;
  verification_method?: BiometricVerificationMethod;
  device_event_id?: string;
  raw_payload_json?: Record<string, unknown>;
  bridge_app_version?: string;
  source_device_serial?: string;
  source_device_name?: string;
}

export interface BiometricBatchInput {
  batch_id: string;
  logs: BiometricPunchInput[];
  bridge_app_version?: string;
  source_device_serial?: string;
  source_device_name?: string;
}

export interface BiometricListFilters {
  outlet_id?: string;
  device_id?: string;
  employee_id?: string;
  biometric_user_id?: string;
  event_type?: string;
  sync_status?: string;
  enrollment_status?: string;
  is_active?: number;
  device_type?: string;
  sync_mode?: string;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface BiometricDeviceInput {
  outlet_id: string;
  device_name: string;
  device_serial: string;
  device_type: BiometricDeviceType;
  sync_mode: BiometricSyncMode;
}

export interface BiometricDeviceUpdateInput {
  outlet_id?: string;
  device_name?: string;
  device_serial?: string;
  device_type?: BiometricDeviceType;
  sync_mode?: BiometricSyncMode;
}

export interface BiometricMappingInput {
  employee_id: string;
  device_id: string;
  biometric_user_id: string;
  enrollment_status?: string;
}

export interface BiometricMappingUpdateInput {
  employee_id?: string;
  biometric_user_id?: string;
  enrollment_status?: string;
}

export interface BiometricReasonInput {
  reason: string;
}

export interface BiometricOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface BiometricLogRecord {
  id: string;
  company_id: string;
  device_id: string;
  outlet_id: string | null;
  biometric_user_id: string;
  employee_id: string | null;
  event_time: string;
  server_received_at: string | null;
  event_type: BiometricEventType;
  verification_method: string | null;
  raw_payload_json: string | null;
  dedupe_key: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
}
