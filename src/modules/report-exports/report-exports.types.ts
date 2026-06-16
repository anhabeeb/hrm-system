export type ReportExportFormat = "xlsx" | "pdf";
export type ReportExportStatus = "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled";
export type ReportExportCategory = "attendance" | "hr" | "payroll" | "expiry" | "employee_profile";

export interface ReportExportColumn {
  key: string;
  label: string;
  data_type: string;
  description?: string;
  sensitive?: boolean;
  required_permission?: string;
  default_visible?: boolean;
  redacted?: boolean;
}

export interface ReportExportCatalogItem {
  report_key: string;
  name: string;
  description: string;
  category: ReportExportCategory;
  required_permission: string;
  route: string;
  formats: ReportExportFormat[];
  export_ready: true;
  sensitive: boolean;
  columns: ReportExportColumn[];
}

export interface ReportExportFilters {
  [key: string]: unknown;
}

export interface ReportExportPreviewInput {
  report_key: string;
  format?: ReportExportFormat;
  filters?: ReportExportFilters;
}

export interface ReportExportCreateInput extends ReportExportPreviewInput {
  format: ReportExportFormat;
  idempotency_key?: string;
}

export interface ReportExportJob {
  id: string;
  company_id: string;
  report_key: string;
  report_category: string;
  format: ReportExportFormat | string;
  status: ReportExportStatus | string;
  requested_by: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  filters_json: string | null;
  columns_json: string | null;
  row_count: number | null;
  file_name: string | null;
  file_size: number | null;
  file_storage_key: string | null;
  download_url: string | null;
  expires_at: string | null;
  sensitive_export: number;
  redaction_level: string;
  idempotency_key: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportExportListFilters {
  report_category?: string;
  report_key?: string;
  format?: string;
  status?: string;
  requested_by?: string;
  from_date?: string;
  to_date?: string;
  page: number;
  page_size: number;
}

export interface ResolvedReportData {
  report_key: string;
  report_name: string;
  category: ReportExportCategory;
  filters: ReportExportFilters;
  columns: ReportExportColumn[];
  rows: Array<Record<string, unknown>>;
  generated_at: string;
  sensitive: boolean;
  redaction_level: string;
  warnings: string[];
}

