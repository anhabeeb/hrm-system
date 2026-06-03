import type { PaginationMeta } from "../../types/api.types";

export interface DocumentOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface DocumentFilters {
  employee_id?: string;
  outlet_id?: string;
  document_type?: string;
  status?: string;
  is_sensitive?: boolean;
  expiring_before?: string;
  page: number;
  page_size: number;
}

export interface DocumentUploadInput {
  employee_id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  content_base64?: string;
  expiry_date?: string;
  is_sensitive?: boolean;
}

export interface DocumentUpdateInput {
  document_type?: string;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string | null;
  status?: string;
  is_sensitive?: boolean;
  reason?: string;
}

export interface DocumentDeleteInput {
  reason: string;
}

export interface DocumentCategoryInput {
  category_key: string;
  category_name: string;
  is_sensitive?: boolean;
  requires_expiry_date?: boolean;
  applies_to_foreign_employee?: boolean;
  applies_to_local_employee?: boolean;
  status?: string;
  reason?: string;
}

export interface DocumentCategoryFilters {
  status?: string;
  is_sensitive?: boolean;
  applies_to_foreign_employee?: boolean;
  applies_to_local_employee?: boolean;
  page: number;
  page_size: number;
}

export interface DocumentListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
