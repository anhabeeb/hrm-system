export type ReportExportFormat = "xlsx" | "pdf";

export interface ReportExportColumn {
  key: string;
  label: string;
  data_type: string;
  sensitive?: boolean;
  redacted?: boolean;
}

export interface ReportExportCatalogItem {
  report_key: string;
  name: string;
  description: string;
  category: string;
  required_permission: string;
  formats: ReportExportFormat[];
  sensitive: boolean;
  columns: ReportExportColumn[];
}

export interface ReportExportJob {
  id: string;
  report_key: string;
  report_category: string;
  format: ReportExportFormat;
  status: string;
  requested_by: string | null;
  requested_at: string;
  completed_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  row_count: number | null;
  file_name: string | null;
  file_size: number | null;
  sensitive_export: boolean;
  redaction_level: string;
}

export interface ReportPrintData {
  report_key: string;
  report_name: string;
  category: string;
  filters: Record<string, unknown>;
  columns: ReportExportColumn[];
  rows: Array<Record<string, unknown>>;
  generated_at: string;
  sensitive: boolean;
  redaction_level: string;
  warnings: string[];
  print: boolean;
}

