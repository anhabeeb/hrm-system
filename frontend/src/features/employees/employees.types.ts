import type { Pagination } from "@/types/api";

export type EmployeeType = "local" | "foreign";
export type EmploymentStatus = "active" | "on_leave" | "long_leave" | "suspended" | "resigned" | "terminated" | "archived";

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: EmployeeType;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  primary_outlet_id?: string | null;
  primary_outlet_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  employment_status: EmploymentStatus;
  joined_at?: string | null;
  contract_type?: string | null;
  document_expiry_status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeFilters {
  search?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_type?: EmployeeType;
  employment_status?: EmploymentStatus;
  page?: number;
  page_size?: number;
}

export interface EmployeePayload {
  employee_code: string;
  full_name: string;
  employee_type: EmployeeType;
  primary_outlet_id: string;
  department_id?: string | null;
  position_id?: string | null;
  employment_status: EmploymentStatus;
  joined_at?: string | null;
  nationality?: string | null;
  phone?: string | null;
  contract_type?: string | null;
  notes?: string | null;
}

export type EmployeeUpdatePayload = Partial<Omit<EmployeePayload, "primary_outlet_id" | "employment_status">>;

export interface EmployeeDetailResponse {
  employee: Employee;
}

export interface EmployeeSalaryRow {
  id: string;
  monthly_salary_amount: number;
  currency?: string | null;
  effective_from?: string | null;
  created_at?: string;
}

export interface EmployeeDocumentRow {
  id: string;
  document_type?: string | null;
  document_name?: string | null;
  file_name?: string | null;
  expiry_date?: string | null;
  status?: string | null;
  is_sensitive?: number | boolean | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  created_at?: string;
}

export interface EmployeeNoteRow {
  id: string;
  note_type?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface PaginatedEmployees {
  data: Employee[];
  pagination?: Pagination;
}
