import type { AuthActor, PaginationMeta } from "../../types/api.types";

export const APPROVAL_OPERATION_TYPES = [
  "LEAVE_REQUEST",
  "ATTENDANCE_CORRECTION",
  "ROSTER_CHANGE",
  "PAYROLL_ADJUSTMENT",
  "ADVANCE_PAYMENT",
  "EMPLOYEE_DOCUMENT_UPDATE",
  "EMPLOYEE_TRANSFER",
  "RESIGNATION",
  "DISCIPLINARY_ACTION",
  "GENERIC_REQUEST",
] as const;

export const APPROVAL_WORKFLOW_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const APPROVAL_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "SKIPPED",
  "ESCALATED",
  "NEEDS_MANUAL_ASSIGNMENT",
] as const;
export const APPROVAL_STEP_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SKIPPED",
  "ESCALATED",
  "WAITING_FOR_APPROVER",
  "CANCELLED",
] as const;
export const APPROVER_RESOLVER_TYPES = [
  "REQUESTER_MANAGER",
  "DEPARTMENT_HEAD",
  "DEPARTMENT_LEVEL",
  "DEPARTMENT_ROLE",
  "HR_FINAL_APPROVER",
  "FINANCE_FINAL_APPROVER",
  "ROLE_PERMISSION",
  "SPECIFIC_USER",
  "SUPER_ADMIN",
  "MANUAL_ASSIGNMENT",
] as const;
export const APPROVAL_FALLBACK_BEHAVIORS = [
  "SKIP_TO_HR",
  "ESCALATE_TO_SUPER_ADMIN",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCK_SUBMISSION",
] as const;

export type ApprovalOperationType = (typeof APPROVAL_OPERATION_TYPES)[number];
export type ApprovalWorkflowStatus = (typeof APPROVAL_WORKFLOW_STATUSES)[number];
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];
export type ApproverResolverType = (typeof APPROVER_RESOLVER_TYPES)[number];
export type ApprovalFallbackBehavior = (typeof APPROVAL_FALLBACK_BEHAVIORS)[number];

export interface ApprovalWorkflowEngineRecord {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  operation_type: ApprovalOperationType;
  status: ApprovalWorkflowStatus;
  is_default: number;
  applies_to_department_id: string | null;
  applies_to_level_min: number | null;
  applies_to_level_max: number | null;
  steps_count?: number;
  updated_at: string;
  created_at: string;
  archived_at: string | null;
}

export interface ApprovalWorkflowStepEngineRecord {
  id: string;
  company_id: string;
  workflow_id: string;
  step_order: number;
  step_code: string;
  step_name: string;
  approver_resolver_type: ApproverResolverType;
  required_permission: string | null;
  required_role_id: string | null;
  required_department_id: string | null;
  required_min_level: number | null;
  required_max_level: number | null;
  specific_user_id: string | null;
  is_final_step: number;
  all_approvers_required: number;
  min_approvals_required: number;
  allow_self_approval: number;
  fallback_behavior: ApprovalFallbackBehavior;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequestEngineRecord {
  id: string;
  company_id: string;
  workflow_id: string;
  operation_type: ApprovalOperationType;
  subject_type: string;
  subject_id: string;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  subject_employee_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  title: string;
  summary: string | null;
  payload_json: string | null;
  status: ApprovalRequestStatus;
  current_step_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string | null;
  subject_employee_name?: string | null;
  department_name?: string | null;
  current_step_name?: string | null;
}

export interface ApprovalRequestStepEngineRecord {
  id: string;
  company_id: string;
  approval_request_id: string;
  workflow_step_id: string;
  step_order: number;
  step_code: string;
  step_name: string;
  approver_resolver_type: ApproverResolverType;
  assigned_approver_user_id: string | null;
  assigned_approver_employee_id: string | null;
  assigned_department_id: string | null;
  required_permission: string | null;
  required_role_id: string | null;
  required_min_level: number | null;
  required_max_level: number | null;
  status: ApprovalStepStatus;
  fallback_applied: ApprovalFallbackBehavior | null;
  resolved_at: string | null;
  due_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  skipped_at: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_approver_name?: string | null;
}

export interface ApprovalActionEngineRecord {
  id: string;
  action: string;
  actor_user_id: string;
  actor_employee_id: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  comment: string | null;
  metadata_json: string | null;
  created_at: string;
  actor_name?: string | null;
  step_name?: string | null;
}

export interface ApprovalWorkflowInput {
  code: string;
  name: string;
  description?: string | null;
  operation_type: ApprovalOperationType;
  status?: ApprovalWorkflowStatus;
  is_default?: boolean;
  applies_to_department_id?: string | null;
  applies_to_level_min?: number | null;
  applies_to_level_max?: number | null;
}

export interface ApprovalWorkflowStepInput {
  step_order: number;
  step_code?: string;
  step_name: string;
  approver_resolver_type: ApproverResolverType;
  required_permission?: string | null;
  required_role_id?: string | null;
  required_department_id?: string | null;
  required_min_level?: number | null;
  required_max_level?: number | null;
  specific_user_id?: string | null;
  is_final_step?: boolean;
  all_approvers_required?: boolean;
  min_approvals_required?: number;
  allow_self_approval?: boolean;
  fallback_behavior?: ApprovalFallbackBehavior;
  is_active?: boolean;
}

export interface ApprovalRequestInput {
  workflow_id?: string;
  operation_type: ApprovalOperationType;
  subject_type: string;
  subject_id: string;
  requester_employee_id?: string | null;
  subject_employee_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  level?: number | null;
  title: string;
  summary?: string | null;
  payload_json?: unknown;
}

export interface ApprovalEngineFilters {
  operation_type?: string;
  status?: string;
  department_id?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface ApprovalResolverCandidate {
  user_id: string;
  employee_id: string | null;
  full_name: string | null;
  employee_name: string | null;
  level: number | null;
  department_id: string | null;
  role_key?: string | null;
}

export interface ApprovalEmployeeContext {
  employee_id: string;
  full_name: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  status: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface ApprovalResolverResult {
  candidates: ApprovalResolverCandidate[];
  assignedApprover: ApprovalResolverCandidate | null;
  status: "RESOLVED" | "SKIPPED" | "WAITING_FOR_APPROVER" | "ESCALATED" | "BLOCKED";
  fallbackApplied: ApprovalFallbackBehavior | null;
  message: string;
}

export interface ApprovalEngineList<T> {
  rows: T[];
  pagination: PaginationMeta;
}

export interface ApprovalActorContext extends AuthActor {
  employeeId?: string | null;
}
