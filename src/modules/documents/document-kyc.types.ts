export const DOCUMENT_KYC_UPDATE_OPERATION = "DOCUMENT_KYC_UPDATE" as const;
export const DOCUMENT_APPROVAL_OPERATION = "DOCUMENT_APPROVAL" as const;
export const DOCUMENT_KYC_SUBJECT_TYPE = "DOCUMENT_KYC_UPDATE" as const;

export const DOCUMENT_KYC_REQUEST_TYPES = [
  "PERSONAL_INFO_UPDATE",
  "CONTACT_INFO_UPDATE",
  "EMERGENCY_CONTACT_UPDATE",
  "ADDRESS_UPDATE",
  "BANK_ACCOUNT_UPDATE",
  "PASSPORT_UPDATE",
  "NATIONAL_ID_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "CONTRACT_DOCUMENT_UPDATE",
  "MEDICAL_DOCUMENT_UPDATE",
  "PROFILE_PHOTO_UPDATE",
  "DEPENDENT_INFO_UPDATE",
  "DOCUMENT_RENEWAL",
  "DOCUMENT_CORRECTION",
  "DOCUMENT_VERIFICATION",
  "GENERAL_KYC_UPDATE",
  "OTHER_DOCUMENT_UPDATE",
  "PROFILE_FIELD_UPDATE",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_REPLACEMENT",
  "KYC_UPDATE",
  "GENERAL_DOCUMENT_KYC_UPDATE",
] as const;

export const DOCUMENT_KYC_DOCUMENT_TYPES = [
  "PASSPORT",
  "NATIONAL_ID",
  "WORK_PERMIT",
  "VISA",
  "EMPLOYMENT_CONTRACT",
  "MEDICAL_CERTIFICATE",
  "BANK_DOCUMENT",
  "PROFILE_PHOTO",
  "ADDRESS_PROOF",
  "EMERGENCY_CONTACT_DOCUMENT",
  "OTHER",
] as const;

export const DOCUMENT_KYC_DOCUMENT_TYPE_ALIASES: Record<string, (typeof DOCUMENT_KYC_DOCUMENT_TYPES)[number]> = {
  passport: "PASSPORT",
  national_id: "NATIONAL_ID",
  id_card: "NATIONAL_ID",
  work_permit: "WORK_PERMIT",
  work_visa: "VISA",
  visa: "VISA",
  employment_contract: "EMPLOYMENT_CONTRACT",
  contract: "EMPLOYMENT_CONTRACT",
  medical_certificate: "MEDICAL_CERTIFICATE",
  bank_document: "BANK_DOCUMENT",
  profile_photo: "PROFILE_PHOTO",
  address_proof: "ADDRESS_PROOF",
  emergency_contact_document: "EMERGENCY_CONTACT_DOCUMENT",
  other: "OTHER",
};

export const DOCUMENT_KYC_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_APPLICATION",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "APPLIED",
  "FAILED_TO_APPLY",
] as const;

export interface DocumentKycEmployeeRecord {
  id: string;
  company_id: string;
  employee_code?: string | null;
  full_name?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  level?: number | null;
  primary_outlet_id?: string | null;
  employment_status?: string | null;
  deleted_at?: string | null;
  archived_at?: string | null;
}

export interface DocumentKycRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  requester_employee_id?: string | null;
  requester_user_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  level?: number | null;
  outlet_id?: string | null;
  request_type: string;
  document_type?: string | null;
  document_id?: string | null;
  requested_field?: string | null;
  current_value_json?: string | null;
  requested_value_json?: string | null;
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
  reviewer_note?: string | null;
  final_approver_note?: string | null;
  apply_note?: string | null;
  approval_request_id?: string | null;
  approval_status?: string | null;
  approval_current_step?: string | null;
  status: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  [key: string]: unknown;
}

export interface DocumentKycStagedUploadRecord {
  id: string;
  company_id: string;
  employee_id: string;
  uploaded_by: string;
  request_id?: string | null;
  file_key: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  status: "STAGED" | "ATTACHED_TO_REQUEST" | "CONSUMED" | "CANCELLED" | "EXPIRED" | string;
  purpose: string;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentKycFilters {
  employee_id?: string;
  request_type?: string;
  status?: string;
  document_type?: string;
  page: number;
  page_size: number;
}

export interface DocumentKycRequestInput {
  employee_id?: string | null;
  request_type: string;
  document_type?: string | null;
  document_id?: string | null;
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

export interface DocumentKycActionInput {
  reason: string;
  note?: string | null;
}
