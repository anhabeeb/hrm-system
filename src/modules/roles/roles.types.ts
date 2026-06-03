import type { PaginationMeta } from "../../types/api.types";

export interface RoleRecord {
  id: string;
  company_id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  users_count?: number;
}

export interface SafeRole {
  id: string;
  role_key: string;
  role_name: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  users_count?: number;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  permission_key: string;
  module: string;
  action: string;
  description: string | null;
}

export interface RoleDetail extends SafeRole {
  permissions: RolePermission[];
}

export interface RoleListFilters {
  page: number;
  page_size: number;
  search?: string;
  status?: string;
}

export interface RoleListResult {
  rows: SafeRole[];
  pagination: PaginationMeta;
}
