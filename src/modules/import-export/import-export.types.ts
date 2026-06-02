export interface ExportCreateInput {
  export_type: string;
  format: "json" | "csv";
  report_key?: string;
  filters: Record<string, unknown>;
  reason?: string;
}

export interface ImportUploadInput {
  import_type: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
  reason?: string;
}

export interface ReasonInput {
  reason: string;
}

export interface ListFilters {
  status?: string;
  type?: string;
  page: number;
  page_size: number;
}
