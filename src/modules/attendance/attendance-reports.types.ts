import type { PaginationMeta } from "../../types/api.types";

export type AttendanceReportKind =
  | "daily"
  | "monthly"
  | "employee_detail"
  | "exceptions"
  | "device_punches"
  | "summary";

export interface AttendanceReportFilters {
  date?: string;
  from_date?: string;
  to_date?: string;
  month?: string;
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  attendance_status?: string;
  source?: string;
  device_id?: string;
  exception_type?: string;
  status?: string;
  late_only?: boolean;
  early_checkout_only?: boolean;
  missing_checkin_only?: boolean;
  missing_checkout_only?: boolean;
  absent_only?: boolean;
  overtime_only?: boolean;
  leave_related_only?: boolean;
  holiday_related_only?: boolean;
  include_details?: boolean;
  page: number;
  page_size: number;
}

export interface AttendanceReportEnvelope<T> {
  data: T[];
  meta: {
    report: AttendanceReportKind;
    generated_at: string;
    generated_for_company_id: string;
    row_count: number;
    source_tables: string[];
  };
  filters: AttendanceReportFilters;
  pagination?: PaginationMeta;
  generated_at: string;
}

