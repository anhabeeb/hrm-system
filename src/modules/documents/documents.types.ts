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
  expiry_from?: string;
  expiry_to?: string;
  expiring_within_days?: number;
  employee_type?: string;
  is_sensitive?: boolean;
  expiring_before?: string;
  page: number;
  page_size: number;
}

export interface DocumentUploadInput {
  employee_id: string;
  document_type: string;
  document_number?: string;
  issue_date?: string;
  start_date?: string;
  file_name: string;
  mime_type: string;
  content_base64?: string;
  expiry_date?: string;
  driving_license_category?: string;
  driving_license_category_other?: string;
  notes?: string;
  is_sensitive?: boolean;
}

export interface DocumentUpdateInput {
  document_type?: string;
  document_number?: string | null;
  issue_date?: string | null;
  start_date?: string | null;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string | null;
  status?: string;
  driving_license_category?: string | null;
  driving_license_category_other?: string | null;
  notes?: string | null;
  is_sensitive?: boolean;
  reason?: string;
}

export interface DocumentReplaceInput extends DocumentUploadInput {
  reason: string;
}

export interface DocumentArchiveInput {
  reason: string;
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
