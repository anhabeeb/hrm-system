import type { Pagination } from "@/types/api";

export type EmployeeType = "local" | "foreign";
export type EmploymentStatus =
  | "active"
  | "probation"
  | "confirmed"
  | "on_leave"
  | "long_leave"
  | "suspended"
  | "resigned"
  | "terminated"
  | "retired"
  | "inactive"
  | "rehired"
  | "archived";

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  employee_type: EmployeeType;
  nationality?: string | null;
  id_card_number?: string | null;
  passport_number?: string | null;
  passport_expiry_date?: string | null;
  work_permit_number?: string | null;
  work_permit_expiry_date?: string | null;
  phone?: string | null;
  email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
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
  emergency_contact_relation?: string | null;
  contract_type?: string | null;
  notes?: string | null;
  starting_salary: {
    amount: number;
    salary_type: "monthly";
    currency?: string;
    effective_from?: string;
    reason?: string | null;
  };
}

export type EmployeeUpdatePayload = Partial<Omit<EmployeePayload, "primary_outlet_id" | "employment_status" | "starting_salary">>;

export interface EmployeeStatusHistoryRow {
  id: string;
  employee_id?: string;
  old_status?: EmploymentStatus | string | null;
  new_status: EmploymentStatus | string;
  effective_from?: string | null;
  effective_to?: string | null;
  reason?: string | null;
  notes?: string | null;
  approval_request_id?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  changed_by?: string | null;
  changed_by_name?: string | null;
  changed_at?: string | null;
  created_at?: string;
}

export interface EmployeeStatusChangePayload {
  new_status: EmploymentStatus;
  effective_from: string;
  reason: string;
  notes?: string | null;
  disable_user_access?: boolean;
  revoke_active_sessions?: boolean;
  override_invalid_transition?: boolean;
  override_reason?: string | null;
  target_active_status?: "active" | "probation" | "confirmed";
}

export interface EmployeeDetailResponse {
  employee: Employee;
}

export interface EmployeeSalaryRow {
  id: string;
  employee_id?: string;
  monthly_salary_amount: number;
  currency?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  change_type?: "starting_salary" | "increment" | "promotion" | "correction" | "contract_change" | "other" | string | null;
  reason?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface EmployeeSalaryChangePayload {
  monthly_salary_amount: number;
  currency: string;
  effective_from: string;
  change_type: "starting_salary" | "increment" | "promotion" | "correction" | "contract_change" | "other";
  reason: string;
}

export interface EmployeeApprovalRequestSummary {
  id: string | null;
  type: string;
  status: string;
  employee_id: string;
  effective_from: string;
}

export interface EmployeeApprovalResponse {
  approval_required: true;
  approval_request_id: string | null;
  approval_request: EmployeeApprovalRequestSummary;
  existing_approval_request?: boolean;
}

export type EmployeeJobChangeType =
  | "promotion"
  | "transfer"
  | "department_change"
  | "position_change"
  | "outlet_change"
  | "correction"
  | "other";

export interface EmployeeJobHistoryRow {
  id: string;
  employee_id?: string;
  change_type: EmployeeJobChangeType | string;
  effective_from: string;
  effective_to?: string | null;
  old_outlet_id?: string | null;
  new_outlet_id?: string | null;
  old_outlet_name?: string | null;
  new_outlet_name?: string | null;
  old_department_id?: string | null;
  new_department_id?: string | null;
  old_department_name?: string | null;
  new_department_name?: string | null;
  old_position_id?: string | null;
  new_position_id?: string | null;
  old_position_title?: string | null;
  new_position_title?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
}

export interface EmployeeJobChangePayload {
  change_type: EmployeeJobChangeType;
  effective_from: string;
  new_outlet_id?: string | null;
  new_department_id?: string | null;
  new_position_id?: string | null;
  reason: string;
  salary_change?: {
    enabled: boolean;
    monthly_salary_amount?: number;
    currency?: string;
    change_type?: EmployeeSalaryChangePayload["change_type"];
    reason?: string;
  };
}

export type EmployeeJobChangeResponse =
  | { employee: Employee; job_change: EmployeeJobHistoryRow; salary_change: EmployeeSalaryRow | null }
  | EmployeeApprovalResponse;

export type EmployeeSalaryChangeResponse =
  | { salary_record_id: string; closed_previous_salary_id?: string | null; salary?: EmployeeSalaryRow }
  | EmployeeApprovalResponse;

export type CompensationComponentType = "allowance" | "benefit" | "deduction";
export type CompensationCalculationType = "fixed_amount" | "percentage_of_basic_salary" | "non_cash_benefit";
export type CompensationComponentStatus = "active" | "scheduled" | "ended" | "cancelled" | "pending_approval";

export interface EmployeeCompensationComponent {
  id: string;
  employee_id: string;
  component_definition_id?: string | null;
  component_type: CompensationComponentType;
  component_code?: string | null;
  component_name: string;
  category?: string | null;
  amount: number;
  currency?: string | null;
  calculation_type: CompensationCalculationType;
  affects_gross_pay?: number | boolean | null;
  affects_net_pay?: number | boolean | null;
  effective_from: string;
  effective_to?: string | null;
  status: CompensationComponentStatus | string;
  effective_status?: CompensationComponentStatus | string;
  reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  calculated_amount?: number;
  cash_payroll_component?: boolean;
}

export interface CompensationComponentDefinition {
  id: string;
  component_type: CompensationComponentType;
  component_code: string;
  component_name: string;
  category?: string | null;
  default_amount?: number | null;
  currency?: string | null;
  calculation_type: CompensationCalculationType;
  affects_gross_pay?: number | boolean | null;
  affects_net_pay?: number | boolean | null;
  status: "active" | "inactive" | string;
  description?: string | null;
}

export interface CompensationComponentDefinitionPayload {
  component_type: CompensationComponentType;
  component_code: string;
  component_name: string;
  category?: string | null;
  default_amount: number;
  amount: number;
  currency: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay: boolean;
  affects_net_pay: boolean;
  description?: string | null;
  reason: string;
}

export interface EmployeeCompensationSummary {
  employee_id: string;
  currency: string;
  basic_salary: number;
  recurring_gross_additions: number;
  recurring_gross_deductions: number;
  recurring_net_additions: number;
  recurring_net_deductions: number;
  recurring_cash_allowances: number;
  recurring_cash_benefits: number;
  recurring_cash_deductions: number;
  non_cash_benefits: number;
  estimated_recurring_gross_pay: number;
  estimated_recurring_net_before_variable_items: number;
  components: EmployeeCompensationComponent[];
  note?: string;
}

export interface EmployeeCompensationComponentPayload {
  component_definition_id?: string | null;
  component_type: CompensationComponentType;
  component_code?: string | null;
  component_name: string;
  category?: string | null;
  amount: number;
  currency: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay: boolean;
  affects_net_pay: boolean;
  effective_from: string;
  reason: string;
  notes?: string | null;
}

export interface EmployeeCompensationComponentEndPayload {
  effective_to: string;
  reason: string;
}

export type EmployeeCompensationComponentMutationResponse =
  | { component: EmployeeCompensationComponent; closed_previous_component_id?: string | null }
  | EmployeeApprovalResponse;

export interface EmployeeDocumentRow {
  id: string;
  document_type?: string | null;
  document_number?: string | null;
  document_name?: string | null;
  file_name?: string | null;
  issue_date?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  status?: string | null;
  validity_status?: string | null;
  days_until_expiry?: number | null;
  driving_license_category?: string | null;
  driving_license_category_other?: string | null;
  version_number?: number | null;
  previous_document_id?: string | null;
  replaced_by_document_id?: string | null;
  notes?: string | null;
  is_sensitive?: number | boolean | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  created_at?: string;
}

export interface EmployeeDocumentCompliance {
  employee_type?: EmployeeType;
  status: "complete" | "missing_optional_documents" | "expiring_soon" | "expired_documents" | "needs_review" | string;
  expected_document_types: string[];
  missing_document_types: string[];
  expired_document_types: string[];
  expiring_soon_document_types: string[];
  needs_review_document_types: string[];
  high_priority_document_types?: string[];
  warning?: string;
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

export interface Employee360Profile {
  summary: {
    employee: Employee;
    warnings: Record<string, number>;
    generated_at: string;
  };
  attendance?: {
    today: Record<string, unknown> | null;
    current_month_summary: Record<string, number>;
    recent_rows: Array<Record<string, unknown>>;
    source_summary: Array<Record<string, unknown>>;
    report_href: string;
  } | null;
  leave?: {
    balances: Array<Record<string, unknown>>;
    recent_requests: Array<Record<string, unknown>>;
    transactions: Array<Record<string, unknown>>;
  } | null;
  long_leave?: {
    active: Record<string, unknown> | null;
    history: Array<Record<string, unknown>>;
    payroll_impacts: Array<Record<string, unknown>>;
  } | null;
  documents?: {
    documents: Array<Record<string, unknown>>;
  } | null;
  contracts?: {
    active_contract: Record<string, unknown> | null;
    contracts: Array<Record<string, unknown>>;
  } | null;
  assets?: {
    assets: Array<Record<string, unknown>>;
    uniforms: Array<Record<string, unknown>>;
  } | null;
  payroll_readiness?: {
    salary_summary: Record<string, unknown> | null;
    attendance_exceptions_affecting_payroll: number;
    long_leave_payroll_impact: Array<Record<string, unknown>>;
    leave_balance_warnings: Array<Record<string, unknown>>;
  } | null;
  alerts?: {
    alerts: Array<Record<string, unknown>>;
    open_count: number;
    critical_count: number;
  } | null;
  timeline?: {
    events: Array<Record<string, unknown>>;
  } | null;
  meta: {
    employee_id: string;
    generated_at: string;
  };
}
