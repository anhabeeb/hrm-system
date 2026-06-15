import type { PaginationMeta } from "../../types/api.types";

export const DISCIPLINARY_ACTION_OPERATION = "DISCIPLINARY_ACTION" as const;
export const DISCIPLINARY_ACTION_SUBJECT_TYPE = "DISCIPLINARY_ACTION" as const;

export const DISCIPLINARY_REQUEST_TYPES = [
  "INCIDENT_REPORT",
  "MISCONDUCT_REPORT",
  "ATTENDANCE_VIOLATION",
  "POLICY_VIOLATION",
  "CONDUCT_VIOLATION",
  "PERFORMANCE_ISSUE",
  "CUSTOMER_COMPLAINT",
  "SAFETY_VIOLATION",
  "HARASSMENT_COMPLAINT",
  "INVESTIGATION",
  "THEFT_OR_FRAUD_ALLEGATION",
  "PROPERTY_DAMAGE",
  "GENERAL_DISCIPLINARY_REPORT",
  "GENERAL_DISCIPLINARY_ACTION",
] as const;

export const DISCIPLINARY_ACTION_TYPES = [
  "VERBAL_WARNING",
  "WRITTEN_WARNING",
  "FINAL_WARNING",
  "PERFORMANCE_IMPROVEMENT_PLAN",
  "TRAINING_REQUIRED",
  "COUNSELLING_REQUIRED",
  "SUSPENSION",
  "SUSPENSION_RECOMMENDATION",
  "PAYROLL_ACTION_RECOMMENDATION",
  "TRANSFER_RECOMMENDATION",
  "OFFBOARDING_RECOMMENDATION",
  "TERMINATION_RECOMMENDATION",
  "NO_ACTION",
  "GENERAL_ACTION",
  "GENERAL_DISCIPLINARY_ACTION",
] as const;

export const DISCIPLINARY_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const DISCIPLINARY_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_DEPARTMENT_REVIEW",
  "PENDING_OWNER_REVIEW",
  "PENDING_INVESTIGATION",
  "PENDING_FINAL_APPROVAL",
  "PENDING_APPLICATION",
  "PENDING_ACKNOWLEDGEMENT",
  "PENDING_FOLLOW_UP",
  "PENDING_MANUAL_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "APPLIED",
  "ACKNOWLEDGED",
  "CLOSED",
  "FAILED_TO_APPLY",
] as const;

export const DISCIPLINARY_ITEM_TYPES = [
  "EVIDENCE",
  "WITNESS_NOTE",
  "POLICY_REFERENCE",
  "EMPLOYEE_RESPONSE",
  "MANAGER_NOTE",
  "INVESTIGATION_NOTE",
  "FOLLOW_UP_TASK",
  "OTHER",
] as const;

export const DISCIPLINARY_TASK_TYPES = [
  "EMPLOYEE_ACKNOWLEDGEMENT",
  "MANAGER_FOLLOW_UP",
  "TRAINING_FOLLOW_UP",
  "PAYROLL_REVIEW",
  "OFFBOARDING_REVIEW",
  "DOCUMENT_UPLOAD",
  "GENERAL_TASK",
] as const;

export type DisciplinaryRequestType = (typeof DISCIPLINARY_REQUEST_TYPES)[number];
export type DisciplinaryActionType = (typeof DISCIPLINARY_ACTION_TYPES)[number];
export type DisciplinarySeverity = (typeof DISCIPLINARY_SEVERITIES)[number];
export type DisciplinaryStatus = (typeof DISCIPLINARY_STATUSES)[number];
export type DisciplinaryTaskType = (typeof DISCIPLINARY_TASK_TYPES)[number];

export interface DisciplineEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string | null;
  full_name: string;
  employment_status: string | null;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface DisciplinaryActionRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  department_id: string | null;
  position_id: string | null;
  level: number | null;
  outlet_id: string | null;
  store_id: string | null;
  manager_employee_id: string | null;
  request_type: DisciplinaryRequestType;
  action_type: DisciplinaryActionType | null;
  operation_type: typeof DISCIPLINARY_ACTION_OPERATION;
  severity: DisciplinarySeverity;
  incident_date: string | null;
  reported_date: string | null;
  title: string;
  summary: string | null;
  description: string;
  policy_reference: string | null;
  requested_action_json: string | null;
  evidence_summary: string | null;
  evidence_attachment_id: string | null;
  employee_response: string | null;
  employee_response_at: string | null;
  acknowledgement_required: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledgement_note: string | null;
  follow_up_required: number;
  follow_up_status: string | null;
  follow_up_json: string | null;
  payroll_follow_up_required: number;
  offboarding_follow_up_required: number;
  training_follow_up_required: number;
  current_value_json: string | null;
  requested_value_json: string | null;
  employee_note: string | null;
  manager_note: string | null;
  investigator_note: string | null;
  owner_note: string | null;
  final_approver_note: string | null;
  execution_note: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  status: DisciplinaryStatus;
  current_step_name?: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  outlet_name?: string | null;
  operation_owner_department_id: string | null;
  operation_final_department_id: string | null;
  operation_execution_department_id: string | null;
  department_reviewed_at: string | null;
  department_reviewed_by: string | null;
  owner_reviewed_at: string | null;
  owner_reviewed_by: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  applied_at: string | null;
  applied_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  apply_error_code: string | null;
  apply_error_message: string | null;
  execution_resolution_json: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface DisciplinaryFollowUpTaskRecord {
  id: string;
  company_id: string;
  disciplinary_action_request_id: string;
  employee_id: string;
  task_type: DisciplinaryTaskType;
  task_name: string;
  owner_responsibility_type: string | null;
  owner_department_id: string | null;
  owner_business_function_code: string | null;
  assigned_user_id: string | null;
  required: number;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisciplinaryRecord {
  id: string;
  company_id: string;
  employee_id: string;
  source_request_id: string;
  action_type: DisciplinaryActionType;
  severity: DisciplinarySeverity;
  incident_date: string | null;
  title: string;
  summary: string | null;
  outcome: string | null;
  policy_reference: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  acknowledgement_required: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  status: string;
  applied_at: string;
  applied_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DisciplinaryActionInput {
  employee_id?: string | null;
  request_type: DisciplinaryRequestType;
  action_type?: DisciplinaryActionType | null;
  severity: DisciplinarySeverity;
  incident_date?: string | null;
  title: string;
  summary?: string | null;
  description: string;
  policy_reference?: string | null;
  evidence_summary?: string | null;
  acknowledgement_required?: boolean | number | null;
  payroll_follow_up_required?: boolean | number | null;
  offboarding_follow_up_required?: boolean | number | null;
  training_follow_up_required?: boolean | number | null;
  requested_action_json?: Record<string, unknown> | null;
  current_value_json?: Record<string, unknown> | null;
  requested_value_json?: Record<string, unknown> | null;
}

export interface DisciplinaryActionCommandInput {
  reason: string;
  note?: string | null;
}

export interface DisciplinaryActionFilters {
  employee_id?: string;
  department_id?: string;
  outlet_id?: string;
  request_type?: DisciplinaryRequestType;
  action_type?: DisciplinaryActionType;
  severity?: DisciplinarySeverity;
  status?: DisciplinaryStatus;
  approval_status?: string;
  page: number;
  page_size: number;
}

export interface DisciplinaryActionListResult {
  rows: DisciplinaryActionRequestRecord[];
  pagination: PaginationMeta;
}
