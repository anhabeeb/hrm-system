export type PayrollReportCategory =
  | "payroll"
  | "salary"
  | "deductions"
  | "advances_loans"
  | "attendance"
  | "long_leave"
  | "payslips"
  | "approvals"
  | "cost"
  | "audit"
  | "finance_summary";

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
  category: PayrollReportCategory;
  required_permission: string;
  default_filters: Record<string, unknown>;
  available_filters: string[];
  columns: PayrollReportColumn[];
  route: string;
  export_ready: true;
  sensitive: boolean;
}

export interface PayrollReportFilters {
  payroll_month?: string;
  payroll_period_id?: string;
  payroll_run_id?: string;
  from_date?: string;
  to_date?: string;
  month?: string;
  year?: string;
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
  include_archived?: boolean;
  search?: string;
  page: number;
  page_size: number;
  sort_by?: string;
  sort_direction: "asc" | "desc";
}

export interface PayrollReportPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface PayrollReportResult {
  data: Array<Record<string, unknown>>;
  meta: {
    report_key: string;
    report_name: string;
    description: string;
    columns: PayrollReportColumn[];
    generated_by: string | null;
    scope: {
      company_id: string;
      outlet_ids: string[];
      scope_type: "company" | "outlet";
    };
    applied_filters: PayrollReportFilters;
    row_count: number;
    currency: string;
    export_ready: true;
    sensitive: boolean;
    restricted?: boolean;
  };
  filters: PayrollReportFilters;
  pagination: PayrollReportPagination;
  generated_at: string;
}
