import type { Pagination } from "@/types/api";

export type OutletStatus = "active" | "inactive" | "disabled";

export interface Outlet {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  status: OutletStatus;
  created_at?: string;
  updated_at?: string;
}

export interface OutletFilters {
  search?: string;
  status?: OutletStatus;
  page?: number;
  page_size?: number;
}

export interface OutletPayload {
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  status?: OutletStatus;
}

export interface PaginatedOutlets {
  data: Outlet[];
  pagination?: Pagination;
}
