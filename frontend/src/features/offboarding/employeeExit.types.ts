export interface EmployeeExitRequest {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  level?: number | null;
  outlet_id?: string | null;
  request_type: string;
  operation_type: "RESIGNATION" | "OFFBOARDING";
  reason: string;
  resignation_date?: string | null;
  requested_last_working_date?: string | null;
  approved_last_working_date?: string | null;
  notice_period_days?: number | null;
  final_settlement_status?: string | null;
  access_disable_status?: string | null;
  offboarding_checklist_status?: string | null;
  approval_request_id?: string | null;
  approval_status?: string | null;
  approval_current_step?: string | null;
  status: string;
  execution_note?: string | null;
  apply_error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeExitTask {
  id: string;
  exit_request_id?: string | null;
  employee_id: string;
  task_code?: string | null;
  task_name?: string | null;
  task_type: string;
  title: string;
  required: number;
  status: string;
  due_date?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
  owner_responsibility_type?: string | null;
  owner_department_id?: string | null;
  assigned_user_id?: string | null;
}

export interface EmployeeExitPayload {
  employee_id?: string | null;
  operation_type: "RESIGNATION" | "OFFBOARDING";
  request_type: string;
  reason: string;
  resignation_date?: string | null;
  requested_last_working_date?: string | null;
  approved_last_working_date?: string | null;
  notice_period_days?: number | null;
  notice_waiver_requested?: boolean;
  exit_interview_required?: boolean;
  final_settlement_required?: boolean;
  access_disable_required?: boolean;
  handover_required?: boolean;
  employee_note?: string | null;
}

export interface EmployeeExitTimeline {
  employee_exit_request: EmployeeExitRequest;
  tasks?: EmployeeExitTask[];
  steps?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
}
