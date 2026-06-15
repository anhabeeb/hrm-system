export type EmployeeStructureChangeOperation = "EMPLOYEE_TRANSFER" | "EMPLOYEE_STRUCTURE_CHANGE";

export type EmployeeStructureChangeRequest = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  operation_type: EmployeeStructureChangeOperation;
  request_type: string;
  current_department_name?: string | null;
  current_position_title?: string | null;
  current_level: number | null;
  requested_department_id: string | null;
  requested_department_name?: string | null;
  requested_position_id: string | null;
  requested_position_title?: string | null;
  requested_level: number | null;
  requested_outlet_id: string | null;
  apply_role_template: number;
  reason: string;
  status: string;
  approval_request_id: string | null;
  approval_status: string | null;
  apply_error_message?: string | null;
  execution_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeStructureChangePayload = {
  employee_id?: string | null;
  request_type: string;
  requested_department_id?: string | null;
  requested_position_id?: string | null;
  requested_outlet_id?: string | null;
  requested_store_id?: string | null;
  requested_reporting_manager_employee_id?: string | null;
  requested_department_head_employee_id?: string | null;
  apply_role_template?: boolean;
  effective_date?: string | null;
  reason: string;
};

export type EmployeeStructureChangeTimeline = {
  request?: Record<string, unknown> | null;
  steps?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
};

export type EmployeeStructureChangeItem = {
  id: string;
  request_id: string;
  field_name: string;
  previous_value: string | null;
  requested_value: string | null;
  created_at: string;
};
