export interface DocumentRecord {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  document_type?: string;
  document_number?: string | null;
  issue_date?: string | null;
  start_date?: string | null;
  category_name?: string;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string | null;
  status?: string;
  validity_status?: string;
  days_until_expiry?: number | null;
  driving_license_category?: string | null;
  driving_license_category_other?: string | null;
  version_number?: number | null;
  previous_document_id?: string | null;
  replaced_by_document_id?: string | null;
  notes?: string | null;
  is_sensitive?: boolean | number;
  uploaded_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  uploaded_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface MissingDocumentRecord {
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  document_type?: string;
  category_name?: string;
  status?: string;
}

export interface DocumentCategory {
  id: string;
  category_key?: string;
  category_name?: string;
  is_sensitive?: boolean | number;
  requires_expiry_date?: boolean | number;
  applies_to_foreign_employee?: boolean | number;
  applies_to_local_employee?: boolean | number;
  status?: string;
}

export interface DocumentFilters {
  employee_id?: string;
  outlet_id?: string;
  document_type?: string;
  status?: string;
  expiry_from?: string;
  expiry_to?: string;
  expiring_within_days?: number | string;
  employee_type?: string;
  is_sensitive?: boolean | string;
  expiring_before?: string;
  page?: number;
  page_size?: number;
}

export interface DocumentUploadPayload {
  employee_id: string;
  document_type: string;
  document_number?: string;
  issue_date?: string;
  start_date?: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
  expiry_date?: string;
  driving_license_category?: string;
  driving_license_category_other?: string;
  notes?: string;
  is_sensitive?: boolean;
}

export interface DocumentUpdatePayload {
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
