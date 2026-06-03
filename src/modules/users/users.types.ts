import type { PaginationMeta } from "../../types/api.types";

export interface UserRecord {
  id: string;
  company_id: string;
  employee_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  password_hash?: string | null;
  password_algo?: string | null;
  password_updated_at: string | null;
  password_reset_required: number;
  failed_login_attempts: number;
  locked_until: string | null;
  last_password_reset_at: string | null;
  two_factor_enabled: number;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SafeUser {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  roles: string[];
  role_ids: string[];
  outlet_ids: string[];
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListFilters {
  page: number;
  page_size: number;
  search?: string;
  status?: string;
  role_id?: string;
  outlet_id?: string;
}

export interface UserCreateInput {
  full_name: string;
  email: string;
  status: string;
  role_ids: string[];
  outlet_ids: string[];
}

export interface UserUpdateInput {
  full_name?: string;
  email?: string;
  status?: string;
  role_ids?: string[];
  outlet_ids?: string[];
}

export interface UserRoleAssignmentInput {
  role_ids: string[];
  reason: string;
}

export interface UserReasonInput {
  reason: string;
}

export interface UserListResult {
  rows: SafeUser[];
  pagination: PaginationMeta;
}
