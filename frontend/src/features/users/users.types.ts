import type { Pagination } from "@/types/api";

export interface AdminUser {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  roles?: string[];
  outlet_ids?: string[];
  two_factor_enabled?: boolean;
  last_login_at?: string | null;
}

export interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
  outlet_id?: string;
  page?: number;
  page_size?: number;
}

export interface UserPayload {
  full_name: string;
  email: string;
  role_ids?: string[];
  outlet_ids?: string[];
  status?: string;
}

export interface PaginatedUsers {
  users: AdminUser[];
  pagination?: Pagination;
}
