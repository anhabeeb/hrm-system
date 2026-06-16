import type { Pagination } from "@/types/api";

export interface ReportDefinition {
  report_key: string;
  report_name: string;
  category?: string;
  description?: string;
  required_permission?: string;
  supported_filters?: string[];
  supports_export?: boolean;
  sensitive?: boolean;
}

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  outlet_id?: string;
  employee_id?: string;
  department_id?: string;
  status?: string;
  payroll_month?: string;
  module?: string;
  action?: string;
  device_id?: string;
  days?: number;
  page?: number;
  page_size?: number;
}

export interface ReportResult {
  report_key?: string;
  rows?: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  pagination?: Pagination;
  [key: string]: unknown;
}

export interface ReportGeneratePayload {
  report_key: string;
  filters: ReportFilters;
  format: "xlsx" | "pdf";
}
