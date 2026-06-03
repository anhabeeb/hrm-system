import type { AuthActor } from "../../types/api.types";

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  outlet_id?: string;
  employee_id?: string;
  department_id?: string;
  position_id?: string;
  employee_type?: string;
  employment_status?: string;
  nationality?: string;
  joined_from?: string;
  joined_to?: string;
  leave_type_id?: string;
  status?: string;
  payroll_month?: string;
  module?: string;
  action?: string;
  device_id?: string;
  document_type?: string;
  days?: number;
  page?: number;
  page_size?: number;
}

export interface ReportGenerateInput {
  report_key: string;
  filters: ReportFilters;
  format: "json" | "csv" | "xlsx" | "pdf";
}

export interface OutletScope {
  context: AuthActor;
  outletColumn: string;
  requestedOutletId?: string;
}
