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
  has_file?: boolean;
  expiry_date?: string | null;
  status?: string;
  verification_status?: string | null;
  source_kyc_request_id?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
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

export interface DocumentKycRequestRecord {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  request_type: string;
  document_type?: string | null;
  requested_field?: string | null;
  reason: string;
  status: string;
  verification_status?: string | null;
  approval_request_id?: string | null;
  approval_status?: string | null;
  approval_current_step?: string | null;
  current_value_json?: string | null;
  requested_value_json?: string | null;
  staged_file_name?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  issuing_country?: string | null;
  reviewer_note?: string | null;
  final_approver_note?: string | null;
  apply_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentKycRequestPayload {
  employee_id?: string | null;
  request_type: string;
  document_type?: string | null;
  requested_field?: string | null;
  current_value_json?: Record<string, unknown> | null;
  requested_value_json?: Record<string, unknown> | null;
  staged_file_key?: string | null;
  staged_file_name?: string | null;
  staged_mime_type?: string | null;
  staged_file_size?: number | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  issuing_country?: string | null;
  reason: string;
  employee_note?: string | null;
}
