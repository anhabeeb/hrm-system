export type ImportMode = "create_only" | "update_only" | "upsert" | "validate_only";

export interface ImportTemplateColumn {
  key: string;
  label: string;
  required: boolean;
  data_type: string;
  accepted_values?: string[];
  example: string;
  description: string;
  validation_notes?: string;
  sensitive?: boolean;
}

export interface ImportTemplate {
  import_type: string;
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
  import_type: string;
  file_name?: string | null;
  status: string;
  mode: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  requested_by?: string | null;
  requested_at: string;
  validated_at?: string | null;
  applied_at?: string | null;
  cancelled_at?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
}

export interface ImportRow {
  id: string;
  row_number: number;
  row_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  warnings?: unknown[];
  target_entity_type?: string | null;
  target_entity_id?: string | null;
}

export interface ImportPreviewPayload {
  import_type: string;
  mode: ImportMode;
  csv_content: string;
  file_name?: string;
  file_size?: number;
}

export interface ImportPreviewResult {
  job: ImportJob;
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    sensitive_import: boolean;
  };
  sample_rows: Record<string, unknown>[];
  errors: Array<{ row_number: number; error_code: string; error_message: string }>;
}

export interface ImportFilters {
  import_type?: string;
  status?: string;
  requested_by?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

export interface ImportListResponse<T> {
  data: T[];
  filters: ImportFilters;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  generated_at: string;
}
