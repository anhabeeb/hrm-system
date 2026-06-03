import type { OUTLET_SORT_FIELDS, OUTLET_STATUSES } from "./outlets.constants";

export type OutletStatus = (typeof OUTLET_STATUSES)[number];
export type OutletSortField = (typeof OUTLET_SORT_FIELDS)[number];

export interface OutletRecord {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  manager_user_id: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  status: OutletStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OutletFilters {
  search?: string;
  status?: OutletStatus;
  page: number;
  page_size: number;
  sort_by: OutletSortField;
  sort_direction: "asc" | "desc";
}

export interface OutletWriteInput {
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  manager_user_id?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  status?: OutletStatus;
}
