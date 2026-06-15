export const EMPLOYEE_EXIT_OPERATION_TYPES = ["RESIGNATION", "OFFBOARDING"] as const;

export const RESIGNATION_REQUEST_TYPES = [
  "EMPLOYEE_RESIGNATION",
  "RESIGNATION_ON_BEHALF",
  "RESIGNATION_WITH_NOTICE",
  "IMMEDIATE_RESIGNATION",
  "CONTRACT_END_RESIGNATION",
  "MUTUAL_SEPARATION",
  "RESIGNATION_WITHDRAWAL_REQUEST",
  "GENERAL_RESIGNATION_REQUEST",
] as const;

export const OFFBOARDING_REQUEST_TYPES = [
  "STANDARD_OFFBOARDING",
  "POST_RESIGNATION_OFFBOARDING",
  "CONTRACT_END_OFFBOARDING",
  "ADMIN_INITIATED_OFFBOARDING",
  "ACCESS_DISABLE_REQUEST",
  "FINAL_SETTLEMENT_CLEARANCE",
  "DOCUMENT_HANDOVER",
  "GENERAL_OFFBOARDING",
] as const;

export const EMPLOYEE_EXIT_REQUEST_TYPES = [...RESIGNATION_REQUEST_TYPES, ...OFFBOARDING_REQUEST_TYPES] as const;

export const EMPLOYEE_EXIT_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_DEPARTMENT_REVIEW",
  "PENDING_OWNER_REVIEW",
  "PENDING_FINAL_APPROVAL",
  "PENDING_CLEARANCE",
  "PENDING_FINAL_SETTLEMENT",
  "PENDING_ACCESS_DISABLE",
  "PENDING_APPLICATION",
  "PENDING_MANUAL_REVIEW",
  "APPROVED_PENDING_LAST_WORKING_DATE",
  "NOTICE_PERIOD",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "WITHDRAWN",
  "OFFBOARDING_IN_PROGRESS",
  "CLEARED",
  "COMPLETED",
  "APPLIED",
  "FAILED_TO_APPLY",
] as const;

export const EMPLOYEE_OFFBOARDING_TASK_TYPES = [
  "DEPARTMENT_HANDOVER",
  "DOCUMENT_HANDOVER",
  "ASSET_HANDOVER",
  "FINAL_ATTENDANCE_REVIEW",
  "LEAVE_BALANCE_REVIEW",
  "ADVANCE_BALANCE_REVIEW",
  "PAYROLL_SETTLEMENT_REVIEW",
  "PAYSLIP_FINALIZATION_REVIEW",
  "BIOMETRIC_ACCESS_REVIEW",
  "KIOSK_ACCESS_REVIEW",
  "LOGIN_DISABLE_REVIEW",
  "EXIT_INTERVIEW",
  "GENERAL_TASK",
] as const;

export type EmployeeExitOperationType = (typeof EMPLOYEE_EXIT_OPERATION_TYPES)[number];
export type EmployeeExitRequestType = (typeof EMPLOYEE_EXIT_REQUEST_TYPES)[number];
export type EmployeeExitStatus = (typeof EMPLOYEE_EXIT_STATUSES)[number];
export type EmployeeOffboardingTaskType = (typeof EMPLOYEE_OFFBOARDING_TASK_TYPES)[number];

export interface EmployeeExitFilters {
  employee_id?: string;
  operation_type?: string;
  request_type?: string;
  status?: string;
  department_id?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface EmployeeExitRequestInput {
  employee_id?: string | null;
  operation_type?: EmployeeExitOperationType;
  request_type: EmployeeExitRequestType;
  reason: string;
  resignation_date?: string | null;
  requested_last_working_date?: string | null;
  approved_last_working_date?: string | null;
  notice_period_days?: number | null;
  notice_waiver_requested?: boolean;
  notice_waiver_approved?: boolean;
  exit_interview_required?: boolean;
  final_settlement_required?: boolean;
  access_disable_required?: boolean;
  handover_required?: boolean;
  employee_note?: string | null;
}

export interface EmployeeExitActionInput {
  reason: string;
  note?: string | null;
}

export interface EmployeeExitEmployee {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  company_id: string;
  primary_outlet_id: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  level: number | null;
  employment_status: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface EmployeeExitRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  requester_employee_id: string | null;
  requester_user_id: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  level: number | null;
  outlet_id: string | null;
  store_id: string | null;
  manager_employee_id: string | null;
  request_type: EmployeeExitRequestType;
  operation_type: EmployeeExitOperationType;
  reason: string;
  resignation_date: string | null;
  requested_last_working_date: string | null;
  approved_last_working_date: string | null;
  notice_period_days: number | null;
  notice_waiver_requested: number;
  notice_waiver_approved: number;
  exit_interview_required: number;
  exit_interview_completed: number;
  final_settlement_required: number;
  final_settlement_status: string | null;
  access_disable_required: number;
  access_disable_status: string | null;
  handover_required: number;
  handover_status: string | null;
  offboarding_checklist_status: string | null;
  employee_note: string | null;
  execution_note: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  approval_current_step: string | null;
  status: EmployeeExitStatus;
  approval_submitted_at: string | null;
  approval_completed_at: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  applied_at: string | null;
  applied_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  apply_error_code: string | null;
  apply_error_message: string | null;
  execution_resolution_json: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface EmployeeExitTaskRecord {
  id: string;
  company_id: string;
  exit_request_id: string | null;
  offboarding_case_id: string;
  employee_id: string;
  task_code: string | null;
  task_name: string | null;
  task_type: EmployeeOffboardingTaskType;
  title: string;
  required: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "WAIVED" | "BLOCKED" | "FAILED" | string;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  owner_responsibility_type: string | null;
  owner_department_id: string | null;
  owner_business_function_code: string | null;
  assigned_user_id: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}
