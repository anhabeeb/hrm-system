export type ResponsibilityType = "OWNER" | "REQUEST_REVIEW" | "DEPARTMENT_REVIEW" | "FINAL_APPROVAL" | "SECONDARY_APPROVAL" | "EXECUTION" | "CONFIGURATION" | "AUDIT_VIEW" | "ESCALATION";
export type ResponsibilityFallback =
  | "USE_SUPER_ADMIN"
  | "USE_OWNER"
  | "USE_FINAL_APPROVAL_DEPARTMENT"
  | "HOLD_FOR_MANUAL_ASSIGNMENT"
  | "BLOCK_OPERATION"
  | "SKIP_OPTIONAL_STEP"
  | "FALLBACK_TO_SUPER_ADMIN"
  | "FALLBACK_TO_OWNER"
  | "BLOCKED";
export type TargetType = "BUSINESS_FUNCTION" | "DEPARTMENT" | "SPECIFIC_USER" | "REQUESTER_DEPARTMENT" | "SUBJECT_DEPARTMENT" | "SUPER_ADMIN";

export interface BusinessFunction {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system_default: number;
  is_sensitive: number;
  is_active: number;
  assignment_count?: number;
  archived_at?: string | null;
}

export interface FunctionAssignment {
  id: string;
  business_function_id: string;
  department_id: string;
  assignment_type: string;
  is_primary: number;
  is_active: number;
  business_function_code?: string | null;
  business_function_name?: string | null;
  department_name?: string | null;
  department_status?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface OperationCatalogEntry {
  id: string;
  operation_code: string;
  operation_name: string;
  module_key: string;
  description: string | null;
  default_business_function_code: string | null;
  is_sensitive: number;
  requires_final_approval: number;
  is_active: number;
  responsibility_count?: number;
}

export interface OperationResponsibility {
  id: string;
  operation_code: string;
  responsibility_type: ResponsibilityType;
  target_type: TargetType | null;
  business_function_id: string | null;
  department_id: string | null;
  role_id: string | null;
  user_id: string | null;
  permission_key: string | null;
  min_level: number | null;
  max_level: number | null;
  required_permission: string | null;
  required_role_id: string | null;
  requires_approval: number;
  use_requester_department: number;
  use_subject_department: number;
  fallback_behavior: ResponsibilityFallback;
  priority: number;
  is_required: number;
  is_active: number;
  business_function_code?: string | null;
  business_function_name?: string | null;
  department_name?: string | null;
  role_name?: string | null;
  username?: string | null;
  user_full_name?: string | null;
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
}
