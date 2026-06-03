import type {
  SYNC_ACTION_TYPES,
  SYNC_CONFLICT_TYPES,
  SYNC_ENTITY_TYPES,
  SYNC_RESOLUTIONS,
} from "./sync.constants";

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];
export type SyncActionType = (typeof SYNC_ACTION_TYPES)[number];
export type SyncConflictType = (typeof SYNC_CONFLICT_TYPES)[number];
export type SyncResolution = (typeof SYNC_RESOLUTIONS)[number];

export interface SyncPushEventInput {
  local_id: string;
  entity_type: SyncEntityType | string;
  action_type: SyncActionType | string;
  employee_id: string;
  event_time: string;
  attendance_method?: "pin" | "qr" | "kiosk";
  created_offline?: boolean;
}

export interface SyncPushInput {
  batch_id: string;
  outlet_id?: string;
  device_id?: string;
  events: SyncPushEventInput[];
}

export interface SyncPullQuery {
  outlet_id?: string;
  since: number;
  include: string[];
}

export interface SyncListFilters {
  status?: string;
  conflict_type?: string;
  entity_type?: string;
  employee_id?: string;
  outlet_id?: string;
  device_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
  sort_by?: string;
  sort_direction?: "asc" | "desc";
}

export interface SyncRetryInput {
  sync_item_id?: string;
  batch_id?: string;
  reason: string;
}

export interface SyncForceResyncInput {
  device_id: string;
  outlet_id?: string;
  reason: string;
}

export interface SyncConflictResolveInput {
  resolution: SyncResolution;
  reason: string;
}

export interface SyncOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface SyncConflictRecord {
  id: string;
  company_id: string;
  outlet_id: string | null;
  device_id: string | null;
  employee_id: string | null;
  entity_type: string;
  local_id: string | null;
  conflict_type: string;
  local_payload_json: string | null;
  server_payload_json: string | null;
  status: string;
  resolved_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SyncChangeRecord {
  id: string;
  company_id: string;
  outlet_id: string | null;
  entity_type: string;
  entity_id: string;
  action_type: string;
  change_version: number;
  changed_by: string | null;
  changed_at: string;
  payload_summary_json: string | null;
}

export interface SyncBatchRecord {
  id: string;
  company_id: string;
  outlet_id: string | null;
  device_id: string;
  batch_id: string;
  event_count: number;
  accepted_count: number;
  rejected_count: number;
  conflict_count: number;
  status: string;
  error_message: string | null;
  received_at: string;
  created_at: string;
}
