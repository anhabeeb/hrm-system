export interface DeviceRecord {
  id: string;
  company_id: string;
  outlet_id: string | null;
  device_name: string;
  device_type: string;
  device_token_hash: string | null;
  status: string;
  last_seen_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DeviceType =
  | "kiosk"
  | "biometric"
  | "biometric_placeholder"
  | "bridge"
  | "local_bridge"
  | "mobile"
  | "web"
  | "tablet"
  | "other";

export interface DeviceListFilters {
  outlet_id?: string;
  device_type?: string;
  status?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface DeviceOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface DeviceRegisterInput {
  outlet_id: string;
  device_name: string;
  device_type: DeviceType;
  initial_token?: string;
  reason?: string;
}

export interface DeviceUpdateInput {
  outlet_id?: string;
  device_name?: string;
  device_type?: DeviceType;
  status?: string;
}

export interface DeviceReasonInput {
  reason: string;
}

export interface DeviceHeartbeatInput {
  health_status: "online" | "warning" | "offline";
  pending_count?: number;
  failed_count?: number;
  conflict_count?: number;
  battery_level?: number;
  app_version?: string;
  network_status?: string;
}
