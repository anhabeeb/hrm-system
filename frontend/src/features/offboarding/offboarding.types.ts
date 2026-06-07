export type OffboardingCaseStatus =
  | "draft"
  | "in_progress"
  | "pending_clearance"
  | "ready_for_final_settlement"
  | "completed"
  | "cancelled";

export type OffboardingType = "resignation" | "termination" | "retirement" | "contract_end" | "other";

export type OffboardingTaskStatus = "pending" | "completed" | "waived" | "blocked";

export interface OffboardingCase {
  id: string;
  employee_id: string;
  employee_code?: string | null;
  employee_name?: string | null;
  outlet_id?: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  status: OffboardingCaseStatus;
  offboarding_type: OffboardingType;
  effective_exit_date: string;
  reason: string;
  notes?: string | null;
  initiated_by_name?: string | null;
  initiated_at: string;
  final_settlement_status: string;
  task_total?: number;
  task_completed?: number;
  task_pending?: number;
  created_at: string;
  updated_at: string;
}

export interface OffboardingTask {
  id: string;
  offboarding_case_id: string;
  employee_id: string;
  task_type: string;
  title: string;
  description?: string | null;
  status: OffboardingTaskStatus;
  required: number;
  due_date?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  source_type?: string | null;
  source_id?: string | null;
}

export interface FinalSettlementDraft {
  id: string;
  status: string;
  period_start: string;
  period_end: string;
  basic_salary_due: number;
  allowances_due: number;
  unpaid_leave_deductions: number;
  attendance_deductions: number;
  advances_outstanding: number;
  loans_outstanding: number;
  asset_deductions: number;
  uniform_deductions: number;
  leave_encashment: number;
  gratuity_or_service_benefit: number;
  other_earnings: number;
  other_deductions: number;
  estimated_net_settlement: number;
  currency: string;
  calculation_metadata_json?: string | null;
}

export interface OffboardingCaseDetail {
  case: OffboardingCase;
  tasks: OffboardingTask[];
  settlement_draft?: FinalSettlementDraft | null;
}

export interface EmployeeOffboardingResponse {
  cases: OffboardingCase[];
  active_case?: OffboardingCaseDetail | null;
}

export interface StartOffboardingPayload {
  offboarding_type: OffboardingType;
  effective_exit_date: string;
  reason: string;
  notes?: string | null;
  create_default_tasks: boolean;
}

export interface OffboardingFilters {
  status?: string;
  offboarding_type?: string;
  outlet_id?: string;
  department_id?: string;
  employee_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}
