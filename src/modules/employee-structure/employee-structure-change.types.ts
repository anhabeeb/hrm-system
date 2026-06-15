export const EMPLOYEE_STRUCTURE_CHANGE_OPERATIONS = ["EMPLOYEE_TRANSFER", "EMPLOYEE_STRUCTURE_CHANGE"] as const;

export const EMPLOYEE_TRANSFER_REQUEST_TYPES = [
  "DEPARTMENT_TRANSFER",
  "OUTLET_TRANSFER",
  "STORE_TRANSFER",
  "DEPARTMENT_AND_OUTLET_TRANSFER",
  "POSITION_TRANSFER",
  "INTER_DEPARTMENT_POSITION_CHANGE",
  "TEMPORARY_TRANSFER",
  "PERMANENT_TRANSFER",
] as const;

export const EMPLOYEE_STRUCTURE_REQUEST_TYPES = [
  "POSITION_TITLE_CHANGE",
  "LEVEL_CHANGE",
  "DEPARTMENT_ASSIGNMENT_CHANGE",
  "OUTLET_ASSIGNMENT_CHANGE",
  "STORE_ASSIGNMENT_CHANGE",
  "ROLE_TEMPLATE_REAPPLY",
  "DEPARTMENT_HEAD_CHANGE",
  "REPORTING_MANAGER_CHANGE",
  "EMPLOYEE_STRUCTURE_CORRECTION",
  "GENERAL_STRUCTURE_CHANGE",
] as const;

export const EMPLOYEE_STRUCTURE_CHANGE_REQUEST_TYPES = [
  ...EMPLOYEE_TRANSFER_REQUEST_TYPES,
  ...EMPLOYEE_STRUCTURE_REQUEST_TYPES,
] as const;

export const EMPLOYEE_STRUCTURE_CHANGE_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_CURRENT_DEPARTMENT_REVIEW",
  "PENDING_TARGET_DEPARTMENT_REVIEW",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_APPLICATION",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "APPLIED",
  "FAILED_TO_APPLY",
] as const;

export type EmployeeStructureChangeOperation = (typeof EMPLOYEE_STRUCTURE_CHANGE_OPERATIONS)[number];
export type EmployeeStructureChangeRequestType = (typeof EMPLOYEE_STRUCTURE_CHANGE_REQUEST_TYPES)[number];
export type EmployeeStructureChangeStatus = (typeof EMPLOYEE_STRUCTURE_CHANGE_STATUSES)[number];

export interface EmployeeStructureChangeFilters {
  employee_id?: string;
  operation_type?: string;
  request_type?: string;
  status?: string;
  department_id?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface EmployeeStructureChangeInput {
  employee_id?: string | null;
  operation_type?: EmployeeStructureChangeOperation;
  request_type: EmployeeStructureChangeRequestType;
  requested_department_id?: string | null;
  requested_position_id?: string | null;
  requested_outlet_id?: string | null;
  requested_store_id?: string | null;
  requested_reporting_manager_employee_id?: string | null;
  requested_department_head_employee_id?: string | null;
  apply_role_template?: boolean;
  effective_date?: string | null;
  reason: string;
}

export interface EmployeeStructureChangeActionInput {
  reason: string;
  note?: string | null;
}

export interface EmployeeStructureChangeEmployee {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  company_id: string;
  primary_outlet_id: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  level: number | null;
  employment_status: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface EmployeeStructureChangeRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  requester_employee_id: string | null;
  requester_user_id: string;
  operation_type: EmployeeStructureChangeOperation;
  request_type: EmployeeStructureChangeRequestType;
  current_department_id: string | null;
  current_department_name?: string | null;
  current_position_id: string | null;
  current_position_title?: string | null;
  current_level: number | null;
  current_outlet_id: string | null;
  requested_department_id: string | null;
  requested_department_name?: string | null;
  requested_position_id: string | null;
  requested_position_title?: string | null;
  requested_level: number | null;
  requested_outlet_id: string | null;
  requested_store_id: string | null;
  requested_reporting_manager_employee_id: string | null;
  requested_department_head_employee_id: string | null;
  apply_role_template: number;
  effective_date: string | null;
  reason: string;
  status: EmployeeStructureChangeStatus;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  owner_reviewed_at: string | null;
  owner_reviewed_by: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  applied_at: string | null;
  applied_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  apply_error_code: string | null;
  apply_error_message: string | null;
  execution_resolution_json: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}
