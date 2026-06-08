import type { Pagination } from "@/types/api";

export interface PayrollReportColumn {
  key: string;
  label: string;
  data_type: "text" | "number" | "money" | "date" | "boolean" | "status";
  description: string;
  sortable?: boolean;
  filterable?: boolean;
  sensitive?: boolean;
}

export interface PayrollReportDefinition {
  report_key: string;
  name: string;
  description: string;
  category: string;
  required_permission: string;
  default_filters: Record<string, unknown>;
  available_filters: string[];
  columns: PayrollReportColumn[];
  route: string;
  export_ready: true;
  sensitive?: boolean;
}

export interface PayrollReportFilters {
  payroll_month?: string;
  payroll_period_id?: string;
  payroll_run_id?: string;
  from_date?: string;
  to_date?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_type?: "local" | "foreign" | "all";
  payroll_status?: string;
  payslip_status?: string;
  approval_status?: string;
  deduction_type?: string;
  component_type?: string;
  payment_status?: string;
  variance_threshold?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface PayrollReportResult {
  data: Record<string, unknown>[];
  meta: {
    report_key: string;
    report_name: string;
    description: string;
    columns: PayrollReportColumn[];
    row_count: number;
    currency?: string;
    export_ready: true;
    sensitive?: boolean;
    restricted?: boolean;
  };
  filters: PayrollReportFilters;
  pagination: Pagination;
  generated_at: string;
}

export interface PayrollReportCatalogResponse {
  data: PayrollReportDefinition[];
  meta: Record<string, unknown>;
  generated_at: string;
}
