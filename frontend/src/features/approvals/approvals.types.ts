export interface ApprovalRequest {
  id: string;
  workflow_id?: string;
  workflow_key?: string;
  module?: string;
  entity_type?: string;
  entity_id?: string;
  employee_id?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  summary?: string;
  status?: string;
  current_step?: number;
  waiting_for?: string;
  requested_by?: string;
  requested_by_name?: string;
  can_approve?: boolean | number;
  can_reject?: boolean | number;
  can_return?: boolean | number;
  can_cancel?: boolean | number;
  can_override?: boolean | number;
  can_retry?: boolean | number;
  disabled_reason?: string | null;
  actions_available?: {
    can_approve?: boolean | number;
    can_reject?: boolean | number;
    can_return?: boolean | number;
    can_cancel?: boolean | number;
    can_override?: boolean | number;
    can_retry?: boolean | number;
    disabled_reason?: string | null;
  };
  payload_json?: unknown;
  payload_summary?: unknown;
  applied_at?: string | null;
  applying_started_at?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalHistory {
  id?: string;
  action?: string;
  step_order?: number;
  actor_name?: string;
  old_status?: string;
  new_status?: string;
  comment?: string;
  reason?: string;
  created_at?: string;
}

export interface ApprovalWorkflow {
  id: string;
  workflow_key?: string;
  workflow_name?: string;
  module?: string;
  approval_mode?: string;
  is_enabled?: boolean | number;
  steps_count?: number;
  steps?: ApprovalStep[];
}

export interface ApprovalStep {
  id: string;
  step_order?: number;
  step_name?: string;
  required_role_key?: string | null;
  required_permission_key?: string | null;
  approval_type?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  is_required?: boolean | number;
}

export interface ApprovalThreshold {
  id: string;
  workflow_key?: string;
  threshold_name?: string;
  threshold_type?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  percentage_min?: number | null;
  percentage_max?: number | null;
  currency?: string;
  is_active?: boolean | number;
  effective_from?: string | null;
}

export interface ApprovalFilters {
  status?: string;
  module?: string;
  workflow_id?: string;
  workflow_key?: string;
  entity_type?: string;
  employee_id?: string;
  outlet_id?: string;
  requested_by?: string;
  assigned_to_me?: boolean | string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface WorkflowFilters {
  module?: string;
  workflow_key?: string;
  is_enabled?: boolean | string;
  page?: number;
  page_size?: number;
}

export interface ThresholdFilters {
  workflow_key?: string;
  threshold_type?: string;
  is_active?: boolean | string;
  page?: number;
  page_size?: number;
}
