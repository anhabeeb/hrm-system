export interface ImportExportFilters {
  status?: string;
  type?: string;
  page?: number;
  page_size?: number;
}

export interface ExportJob {
  id: string;
  export_type?: string;
  file_type?: string;
  filters_json?: string;
  row_count?: number;
  status?: string;
  requested_by?: string;
  reason?: string;
  created_at?: string;
  completed_at?: string | null;
  file_ready?: boolean | number;
  [key: string]: unknown;
}

export interface ImportJob {
  id: string;
  import_type?: string;
  file_name?: string;
  status?: string;
  total_rows?: number;
  success_rows?: number;
  warning_rows?: number;
  failed_rows?: number;
  uploaded_by?: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface ImportTemplate {
  template_key?: string;
  template_type?: string;
  template_name?: string;
  description?: string;
  columns?: unknown[];
  [key: string]: unknown;
}

export interface ExportCreatePayload {
  export_type: string;
  format: "json" | "csv";
  report_key?: string;
  filters: Record<string, unknown>;
  reason?: string;
}

export interface ImportUploadPayload {
  import_type: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
  reason: string;
}
