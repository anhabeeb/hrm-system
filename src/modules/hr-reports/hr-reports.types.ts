export type HrReportCategory =
  | "employee"
  | "compliance"
  | "documents"
  | "attendance"
  | "leave"
  | "long_leave"
  | "lifecycle"
  | "assets"
  | "summary";

export interface HrReportColumn {
  key: string;
  label: string;
  data_type: "text" | "number" | "date" | "boolean" | "status";
  description: string;
  sortable?: boolean;
  filterable?: boolean;
}

export interface HrReportDefinition {
  report_key: string;
  name: string;
  description: string;
  category: HrReportCategory;
  required_permission: string;
  default_filters: Record<string, unknown>;
  available_filters: string[];
  columns: HrReportColumn[];
  route: string;
  export_ready: true;
}

export interface HrReportFilters {
  from_date?: string;
  to_date?: string;
  as_of_date: string;
  month?: string;
  year?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_type?: "local" | "foreign" | "all";
  employment_status?: string;
  document_status?: string;
  compliance_status?: string;
  expiry_status?: string;
  leave_type_id?: string;
  leave_status?: string;
  approval_status?: string;
  long_leave_status?: string;
  contract_status?: string;
  probation_status?: string;
  asset_status?: string;
  include_archived?: boolean;
  search?: string;
  page: number;
  page_size: number;
  sort_by?: string;
  sort_direction: "asc" | "desc";
}

export interface HrReportPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface HrReportResult {
  data: Array<Record<string, unknown>>;
  meta: {
    report_key: string;
    report_name: string;
    description: string;
    columns: HrReportColumn[];
    generated_by: string | null;
    scope: {
      company_id: string;
      outlet_ids: string[];
      scope_type: "company" | "outlet";
    };
    applied_filters: HrReportFilters;
    row_count: number;
    export_ready: true;
  };
  filters: HrReportFilters;
  pagination: HrReportPagination;
  generated_at: string;
}
