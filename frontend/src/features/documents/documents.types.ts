export interface DocumentRecord {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  document_type?: string;
  category_name?: string;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string | null;
  status?: string;
  is_sensitive?: boolean | number;
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
  is_sensitive?: boolean | string;
  expiring_before?: string;
  page?: number;
  page_size?: number;
}

export interface DocumentUploadPayload {
  employee_id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
  expiry_date?: string;
  is_sensitive?: boolean;
}

export interface DocumentUpdatePayload {
  document_type?: string;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string | null;
  status?: string;
  is_sensitive?: boolean;
  reason?: string;
}
