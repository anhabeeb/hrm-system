import type {
  COMPENSATION_CALCULATION_TYPES,
  COMPENSATION_COMPONENT_STATUSES,
  COMPENSATION_COMPONENT_TYPES,
  EMPLOYEE_SORT_FIELDS,
  EMPLOYEE_TYPES,
  EMPLOYMENT_STATUSES,
} from "./employees.constants";

export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";
export type CompensationComponentType = (typeof COMPENSATION_COMPONENT_TYPES)[number];
export type CompensationCalculationType = (typeof COMPENSATION_CALCULATION_TYPES)[number];
export type CompensationComponentStatus = (typeof COMPENSATION_COMPONENT_STATUSES)[number];

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
  profile_photo_key?: string | null;
  profile_photo_updated_at?: string | null;
  profile_photo_uploaded_by?: string | null;
  profile_photo_url?: string | null;
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
  emergency_contact_relation: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level?: number | null;
  structure_updated_at?: string | null;
  structure_updated_by?: string | null;
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
  level?: number | null;
  document_expiry_status: string | null;
  has_login?: number | boolean | null;
  linked_user_id?: string | null;
  linked_username?: string | null;
  linked_user_email?: string | null;
  linked_user_active?: number | boolean | null;
  linked_role_name?: string | null;
  linked_role_id?: string | null;
  linked_outlet_count?: number | null;
  linked_outlet_names?: string | null;
  linked_password_reset_required?: number | boolean | null;
  linked_two_factor_enabled?: number | boolean | null;
  linked_last_login_at?: string | null;
}

export interface EmployeeLoginCreateInput {
  username: string;
  email?: string | null;
  temporary_password: string;
  role_id: string;
  store_ids?: string[];
  outlet_ids?: string[];
  force_password_change: boolean;
  require_2fa: boolean;
  is_active: boolean;
}

export interface EmployeeLoginUpdateInput {
  username?: string;
  email?: string | null;
  role_id?: string;
  store_ids?: string[];
  outlet_ids?: string[];
  is_active?: boolean;
}

export interface EmployeeLoginPasswordResetInput {
  temporary_password: string;
  force_password_change: boolean;
}

export interface EmployeeLoginLinkExistingInput {
  user_id: string;
  role_id?: string;
  store_ids?: string[];
  outlet_ids?: string[];
}

export interface EmployeeLoginLinkCandidateFilters extends PaginationInput {
  search?: string;
  employee_id?: string;
}

export interface EmployeeLoginLinkCandidate {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  status: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string | null;
  linked_status: "available" | "linked_to_current_employee";
}

export interface EmployeeLoginDetails {
  user_id: string;
  employee_id: string;
  username: string | null;
  email: string | null;
  role_id: string | null;
  role_name: string | null;
  outlet_ids: string[];
  outlet_names: string[];
  outlet_access_count: number;
  status: string;
  is_active: boolean;
  password_reset_required: boolean;
  two_factor_enabled: boolean;
  two_factor_status: "enabled" | "available_after_first_login";
  last_login_at: string | null;
  suggested_roles?: Array<{ role_id: string; role_name: string | null; role_key?: string | null; source: string }>;
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
  emergency_contact_relation?: string | null;
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

export type EmployeePersistInput = EmployeeWriteInput & { employee_code: string; level?: number | null };

export interface EmployeeAccessibleOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface EmployeeStatusInput {
  new_status: EmploymentStatus;
  reason: string;
  effective_from: string;
  effective_date?: string;
  notes?: string | null;
  disable_user_access?: boolean;
  revoke_active_sessions?: boolean;
  override_invalid_transition?: boolean;
  override_reason?: string | null;
  target_active_status?: Extract<EmploymentStatus, "active" | "probation" | "confirmed">;
}

export interface EmployeeStatusHistoryRecord {
  id: string;
  company_id: string;
  employee_id: string;
  old_status: EmploymentStatus | string | null;
  new_status: EmploymentStatus | string;
  effective_from?: string | null;
  effective_to?: string | null;
  reason?: string | null;
  notes?: string | null;
  approval_request_id?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  changed_by?: string | null;
  created_by_name?: string | null;
  changed_by_name?: string | null;
  changed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface PayrollEligibilityResult {
  eligible: boolean;
  eligible_from: string | null;
  eligible_to: string | null;
  excluded_days: number;
  status_segments: Array<{
    status: string;
    start_date: string;
    end_date: string;
    eligible: boolean;
  }>;
  warnings: string[];
}

export interface OutletAssignmentInput {
  outlet_id: string;
  effective_from: string;
  reason: string;
}

export interface JobChangeInput {
  change_type:
    | "promotion"
    | "transfer"
    | "department_change"
    | "position_change"
    | "outlet_change"
    | "correction"
    | "other";
  new_department_id?: string | null;
  new_position_id?: string | null;
  new_outlet_id?: string | null;
  effective_from: string;
  reason: string;
  salary_change?: {
    enabled: boolean;
    monthly_salary_amount?: number;
    currency?: string;
    change_type?: SalaryHistoryInput["change_type"] | "promotion";
    reason?: string;
  } | null;
}

export interface SalaryHistoryInput {
  monthly_salary_amount: number;
  currency?: string;
  effective_from: string;
  change_type: "starting_salary" | "increment" | "promotion" | "correction" | "contract_change" | "other";
  reason: string;
}

export interface CompensationComponentDefinitionRecord {
  id: string;
  company_id: string;
  component_type: CompensationComponentType;
  component_code: string;
  component_name: string;
  category: string | null;
  default_amount: number | null;
  currency: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay: number;
  affects_net_pay: number;
  status: "active" | "inactive";
  description: string | null;
}

export interface EmployeeCompensationComponentInput {
  component_definition_id?: string | null;
  component_type: CompensationComponentType;
  component_code?: string | null;
  component_name: string;
  category?: string | null;
  amount: number;
  currency?: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay?: boolean;
  affects_net_pay?: boolean;
  effective_from: string;
  reason: string;
  notes?: string | null;
}

export interface CompensationComponentDefinitionInput {
  component_type: CompensationComponentType;
  component_code: string;
  component_name: string;
  category?: string | null;
  default_amount?: number | null;
  currency?: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay?: boolean;
  affects_net_pay?: boolean;
  description?: string | null;
  reason: string;
}

export interface CompensationComponentDefinitionFilters extends PaginationInput {
  search?: string;
  component_type?: CompensationComponentType;
  status?: "active" | "inactive";
}

export type EmployeeCompensationComponentChangeInput = Partial<
  Omit<EmployeeCompensationComponentInput, "component_definition_id">
> & {
  effective_from: string;
  reason: string;
};

export interface EmployeeCompensationComponentEndInput {
  effective_to: string;
  reason: string;
}

export interface EmployeeCompensationComponentRecord {
  id: string;
  company_id: string;
  employee_id: string;
  component_definition_id: string | null;
  component_type: CompensationComponentType;
  component_code: string | null;
  component_name: string;
  category: string | null;
  amount: number;
  currency: string;
  calculation_type: CompensationCalculationType;
  affects_gross_pay: number;
  affects_net_pay: number;
  effective_from: string;
  effective_to: string | null;
  status: CompensationComponentStatus;
  revision: number;
  reason: string;
  notes: string | null;
  approval_request_id: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export type CompensationApprovalApplicationAction = "create" | "change" | "end";

export interface CompensationApprovalApplicationRecord {
  id: string;
  company_id: string;
  approval_request_id: string;
  employee_id: string;
  component_id: string;
  action_type: CompensationApprovalApplicationAction;
  applied_at: string;
  created_at: string;
}

export type CompensationEffectiveStatus = "active" | "scheduled" | "ended" | "cancelled" | "pending_approval";

export interface CompensationSummary {
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
  components: Array<EmployeeCompensationComponentRecord & {
    calculated_amount: number;
    cash_payroll_component: boolean;
  }>;
  note: string;
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

export interface EmployeeProfilePhotoInput {
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  content_base64: string;
  reason: string;
}
