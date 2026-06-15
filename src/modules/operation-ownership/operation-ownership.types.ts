import type { PaginationMeta } from "../../types/api.types";

export const BUSINESS_FUNCTION_CODES = [
  "HR_FUNCTION",
  "FINANCE_FUNCTION",
  "PAYROLL_FUNCTION",
  "ATTENDANCE_FUNCTION",
  "ROSTER_FUNCTION",
  "DEVICE_MANAGEMENT_FUNCTION",
  "KIOSK_FUNCTION",
  "DOCUMENT_KYC_FUNCTION",
  "EMPLOYEE_STRUCTURE_FUNCTION",
  "SECURITY_FUNCTION",
  "REPORTING_FUNCTION",
  "SYSTEM_SETTINGS_FUNCTION",
  "GENERAL_ADMIN_FUNCTION",
] as const;

export const OPERATION_RESPONSIBILITY_TYPES = [
  "OWNER",
  "REQUEST_REVIEW",
  "DEPARTMENT_REVIEW",
  "FINAL_APPROVAL",
  "SECONDARY_APPROVAL",
  "EXECUTION",
  "CONFIGURATION",
  "AUDIT_VIEW",
  "ESCALATION",
  "FINAL_APPROVER",
  "EXECUTOR",
  "CONFIGURATION_OWNER",
] as const;

export const OPERATION_TARGET_TYPES = [
  "BUSINESS_FUNCTION",
  "DEPARTMENT",
  "SPECIFIC_USER",
  "REQUESTER_DEPARTMENT",
  "SUBJECT_DEPARTMENT",
  "SUPER_ADMIN",
] as const;

export const OPERATION_RESPONSIBILITY_FALLBACKS = [
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCK_OPERATION",
  "SKIP_OPTIONAL_STEP",
  "FALLBACK_TO_SUPER_ADMIN",
  "FALLBACK_TO_OWNER",
  "BLOCKED",
] as const;

export const OPERATION_RESOLUTION_STATUSES = [
  "RESOLVED",
  "UNASSIGNED",
  "USE_SUPER_ADMIN",
  "USE_OWNER",
  "USE_FINAL_APPROVAL_DEPARTMENT",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCKED",
  "SKIPPED",
] as const;

export type BusinessFunctionCode = (typeof BUSINESS_FUNCTION_CODES)[number];
export type OperationResponsibilityType = (typeof OPERATION_RESPONSIBILITY_TYPES)[number];
export type OperationTargetType = (typeof OPERATION_TARGET_TYPES)[number];
export type OperationResponsibilityFallback = (typeof OPERATION_RESPONSIBILITY_FALLBACKS)[number];
export type OperationResolutionStatus = (typeof OPERATION_RESOLUTION_STATUSES)[number];

export interface OwnershipFilters {
  search?: string;
  status?: string;
  operation_code?: string;
  module_key?: string;
  business_function_id?: string;
  responsibility_type?: string;
  page: number;
  page_size: number;
}

export interface BusinessFunctionRecord {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system_default: number;
  is_sensitive: number;
  is_active: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  assignment_count?: number;
}

export interface BusinessFunctionInput {
  code: string;
  name: string;
  description?: string | null;
  is_sensitive?: boolean;
  is_active?: boolean;
}

export interface BusinessFunctionDepartmentAssignmentRecord {
  id: string;
  company_id: string;
  business_function_id: string;
  department_id: string;
  assignment_type: string;
  is_primary: number;
  is_active: number;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  business_function_code?: string | null;
  business_function_name?: string | null;
  department_name?: string | null;
  department_status?: string | null;
}

export interface FunctionDepartmentAssignmentInput {
  business_function_id: string;
  department_id: string;
  assignment_type?: string;
  is_primary?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface OperationCatalogRecord {
  id: string;
  company_id: string | null;
  operation_code: string;
  operation_name: string;
  module_key: string;
  description: string | null;
  default_business_function_code: string | null;
  is_sensitive: number;
  requires_final_approval: number;
  is_active: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  responsibility_count?: number;
}

export interface OperationCatalogInput {
  operation_code: string;
  operation_name: string;
  module_key: string;
  description?: string | null;
  default_business_function_code?: string | null;
  is_sensitive?: boolean;
  requires_final_approval?: boolean;
  is_active?: boolean;
}

export interface OperationResponsibilityRecord {
  id: string;
  company_id: string;
  operation_code: string;
  responsibility_type: OperationResponsibilityType;
  business_function_id: string | null;
  department_id: string | null;
  role_id: string | null;
  user_id: string | null;
  permission_key: string | null;
  target_type: OperationTargetType | null;
  min_level: number | null;
  max_level: number | null;
  required_permission: string | null;
  required_role_id: string | null;
  requires_approval: number;
  use_requester_department: number;
  use_subject_department: number;
  fallback_behavior: OperationResponsibilityFallback;
  priority: number;
  is_required: number;
  is_active: number;
  archived_at?: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  business_function_code?: string | null;
  business_function_name?: string | null;
  department_name?: string | null;
  role_name?: string | null;
  username?: string | null;
  user_full_name?: string | null;
}

export interface OperationResponsibilityInput {
  operation_code: string;
  responsibility_type: OperationResponsibilityType;
  target_type: OperationTargetType;
  business_function_id?: string | null;
  department_id?: string | null;
  role_id?: string | null;
  user_id?: string | null;
  permission_key?: string | null;
  min_level?: number | null;
  max_level?: number | null;
  required_permission?: string | null;
  required_role_id?: string | null;
  requires_approval?: boolean;
  use_requester_department?: boolean;
  use_subject_department?: boolean;
  fallback_behavior?: OperationResponsibilityFallback;
  priority?: number;
  is_required?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface OperationResolutionInput {
  operation_code: string;
  responsibility_type: OperationResponsibilityType;
  requester_employee_id?: string | null;
  subject_employee_id?: string | null;
  department_id?: string | null;
  fallback_behavior?: OperationResponsibilityFallback;
}

export interface OperationResolutionResult {
  status: OperationResolutionStatus;
  operation_code: string;
  responsibility_type: OperationResponsibilityType;
  business_function_id: string | null;
  department_id: string | null;
  role_id: string | null;
  user_id: string | null;
  permission_key: string | null;
  target_type: OperationTargetType | null;
  resolved_department_id: string | null;
  resolved_business_function_id: string | null;
  resolved_business_function_code: string | null;
  resolved_user_id: string | null;
  min_level: number | null;
  max_level: number | null;
  required_permission: string | null;
  required_role_id: string | null;
  fallback_applied: OperationResponsibilityFallback | null;
  resolution_status: OperationResolutionStatus;
  fallback_behavior: OperationResponsibilityFallback | null;
  message: string;
}

export interface MatrixSummary {
  operations_total: number;
  active_responsibilities: number;
  unassigned_operations: number;
  sensitive_unassigned_operations: number;
  business_functions_total: number;
  department_assignments_total: number;
}

export interface SetupWarning {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  operation_code?: string;
  business_function_code?: string;
  responsibility_id?: string;
  department_id?: string | null;
  user_id?: string | null;
}

export interface PaginatedOwnershipResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
