import type { Pagination } from "@/types/api";

export interface AccessLevel {
  id: string;
  level: number;
  name: string;
  description?: string | null;
  is_active?: number | boolean | null;
}

export interface LevelRoleTemplate {
  id: string;
  level: number;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  role_id: string;
  role_name?: string | null;
  role_key?: string | null;
  is_default?: number | boolean | null;
  is_required?: number | boolean | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LevelRoleTemplateFilters {
  level?: number;
  department_id?: string;
  position_id?: string;
  page?: number;
  page_size?: number;
}

export interface LevelRoleTemplatePayload {
  level: number;
  department_id?: string | null;
  position_id?: string | null;
  role_id: string;
  is_default?: boolean;
  is_required?: boolean;
}

export interface PaginatedLevelRoleTemplates {
  templates: LevelRoleTemplate[];
  pagination?: Pagination;
}
