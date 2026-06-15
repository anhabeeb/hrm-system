export interface DisciplinaryAction {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  level?: number | null;
  request_type: string;
  action_type?: string | null;
  severity: string;
  incident_date?: string | null;
  title: string;
  summary?: string | null;
  description: string;
  policy_reference?: string | null;
  evidence_summary?: string | null;
  acknowledgement_required: number;
  acknowledged_at?: string | null;
  follow_up_status?: string | null;
  approval_status?: string | null;
  current_step_name?: string | null;
  status: string;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  apply_error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisciplinaryActionPayload {
  employee_id?: string;
  request_type: string;
  action_type?: string | null;
  severity: string;
  incident_date?: string | null;
  title: string;
  summary?: string | null;
  description: string;
  policy_reference?: string | null;
  evidence_summary?: string | null;
  acknowledgement_required?: boolean;
  payroll_follow_up_required?: boolean;
  offboarding_follow_up_required?: boolean;
  training_follow_up_required?: boolean;
  requested_action_json?: Record<string, unknown> | null;
}

export interface DisciplinaryTask {
  id: string;
  task_type: string;
  task_name: string;
  status: string;
  required: number;
  owner_department_id?: string | null;
  owner_business_function_code?: string | null;
  assigned_user_id?: string | null;
  completed_at?: string | null;
  notes?: string | null;
}

export interface DisciplinaryRecord {
  id: string;
  employee_id: string;
  source_request_id: string;
  action_type: string;
  severity: string;
  incident_date?: string | null;
  title: string;
  outcome?: string | null;
  status: string;
  acknowledgement_required: number;
  acknowledged_at?: string | null;
  applied_at: string;
  archived_at?: string | null;
}

export interface DisciplinaryTimeline {
  disciplinary_action: DisciplinaryAction;
  disciplinary_record?: DisciplinaryRecord | null;
  tasks: DisciplinaryTask[];
  steps: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
}
