import type { PaginationMeta } from "../../types/api.types";

export type ImportType =
  | "employee_master"
  | "employee_documents"
  | "leave_balances"
  | "salary_compensation"
  | "attendance"
  | "holidays"
  | "assets_uniforms"
  | "advances_loans";

export type ImportMode = "create_only" | "update_only" | "upsert" | "validate_only";
export type ImportJobStatus = "uploaded" | "validating" | "preview_ready" | "validation_failed" | "applying" | "completed" | "partially_completed" | "failed" | "cancelled";
export type ImportRowStatus = "pending" | "valid" | "invalid" | "applied" | "skipped" | "failed" | "duplicate";

export interface ImportTemplateColumn {
  key: string;
  label: string;
  required: boolean;
  data_type: "text" | "date" | "number" | "money" | "enum" | "boolean";
  accepted_values?: string[];
  example: string;
  description: string;
  validation_notes?: string;
  sensitive?: boolean;
}

export interface ImportTemplate {
  import_type: ImportType;
  name: string;
  description: string;
  category: string;
  required_permission: string;
  sensitive: boolean;
  supported_modes: ImportMode[];
  max_rows: number;
  columns: ImportTemplateColumn[];
}

export interface ImportJob {
  id: string;
  company_id: string;
  import_type: ImportType | string;
  file_name: string | null;
  file_size: number | null;
  file_storage_key: string | null;
  status: ImportJobStatus | string;
  mode: ImportMode | string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  requested_by: string | null;
  requested_at: string;
  validated_at: string | null;
  applied_at: string | null;
  cancelled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  idempotency_key: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJobRow {
  id: string;
  company_id: string;
  import_job_id: string;
  row_number: number;
  row_data_json: string | null;
  normalized_data_json: string | null;
  status: ImportRowStatus | string;
  error_code: string | null;
  error_message: string | null;
  warnings_json: string | null;
  target_entity_type: string | null;
  target_entity_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJobCreateInput {
  import_type: ImportType;
  mode: ImportMode;
  csv_content: string;
  file_name?: string;
  file_size?: number;
  idempotency_key?: string;
}

export interface ImportPreviewInput extends ImportJobCreateInput {}

export interface ImportListFilters {
  import_type?: string;
  status?: string;
  requested_by?: string;
  from_date?: string;
  to_date?: string;
  page: number;
  page_size: number;
}

export interface ImportRowsFilters {
  status?: string;
  page: number;
  page_size: number;
}

export interface ImportValidationResult {
  job: ImportJob;
  rows: ImportJobRow[];
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    sensitive_import: boolean;
  };
  sample_rows: Array<Record<string, unknown>>;
  errors: Array<{ row_number: number; error_code: string; error_message: string }>;
}

export interface ImportListResult<T> {
  data: T[];
  filters: ImportListFilters | ImportRowsFilters;
  pagination: PaginationMeta;
  generated_at: string;
}
