import type {
  EMPLOYEE_SORT_FIELDS,
  EMPLOYEE_TYPES,
  EMPLOYMENT_STATUSES,
} from "./employees.constants";

export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export interface PaginationInput {
  page: number;
  page_size: number;
}

export interface EmployeeListFilters extends PaginationInput {
  search?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employment_status?: EmploymentStatus;
  employee_type?: EmployeeType;
  nationality?: string;
  joined_from?: string;
  joined_to?: string;
  document_expiring_before?: string;
  sort_by: EmployeeSortField;
  sort_direction: SortDirection;
}

export interface EmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  employee_type: EmployeeType;
  nationality: string | null;
  id_card_number: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  work_permit_number: string | null;
  work_permit_expiry_date: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  contract_type: string | null;
  employment_status: EmploymentStatus;
  joined_at: string | null;
  resigned_at: string | null;
  terminated_at: string | null;
  bank_name: string | null;
  bank_account_masked: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EmployeeListRow extends EmployeeRecord {
  primary_outlet_name: string | null;
  department_name: string | null;
  position_title: string | null;
  document_expiry_status: string | null;
}

export interface EmployeeWriteInput {
  employee_code?: string | null;
  full_name: string;
  employee_type: EmployeeType;
  primary_outlet_id: string;
  department_id?: string | null;
  position_id?: string | null;
  employment_status: EmploymentStatus;
  joined_at?: string | null;
  nationality?: string | null;
  id_card_number?: string | null;
  passport_number?: string | null;
  passport_expiry_date?: string | null;
  work_permit_number?: string | null;
  work_permit_expiry_date?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  contract_type?: string | null;
  bank_name?: string | null;
  bank_account_masked?: string | null;
  notes?: string | null;
}

export interface EmployeeStartingSalaryInput {
  monthly_salary_amount: number;
  salary_type: "monthly";
  currency: string;
  effective_from: string;
  reason: string;
}

export type EmployeeCreateInput = EmployeeWriteInput & {
  starting_salary: EmployeeStartingSalaryInput;
};

export type EmployeeUpdateInput = Partial<
  Omit<EmployeeWriteInput, "primary_outlet_id" | "employment_status">
>;

export type EmployeePersistInput = EmployeeWriteInput & { employee_code: string };

export interface EmployeeAccessibleOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface EmployeeStatusInput {
  new_status: EmploymentStatus;
  reason: string;
  effective_date?: string;
}

export interface OutletAssignmentInput {
  outlet_id: string;
  effective_from: string;
  reason: string;
}

export interface JobChangeInput {
  department_id?: string | null;
  position_id?: string | null;
  effective_from: string;
  reason: string;
}

export interface SalaryHistoryInput {
  monthly_salary_amount: number;
  currency?: string;
  effective_from: string;
  reason: string;
}

export interface DocumentMetadataInput {
  document_type: string;
  file_key: string;
  file_name?: string | null;
  mime_type?: string | null;
  expiry_date?: string | null;
  is_sensitive?: boolean;
}

export interface EmployeeNoteInput {
  note_type?: string;
  note: string;
  is_sensitive?: boolean;
}
