import type {
  OFFBOARDING_CASE_STATUSES,
  OFFBOARDING_TASK_STATUSES,
  OFFBOARDING_TASK_TYPES,
  OFFBOARDING_TYPES,
} from "./offboarding.constants";

export type OffboardingCaseStatus = (typeof OFFBOARDING_CASE_STATUSES)[number];
export type OffboardingType = (typeof OFFBOARDING_TYPES)[number];
export type OffboardingTaskType = (typeof OFFBOARDING_TASK_TYPES)[number];
export type OffboardingTaskStatus = (typeof OFFBOARDING_TASK_STATUSES)[number];

export interface OffboardingListFilters {
  status?: OffboardingCaseStatus;
  offboarding_type?: OffboardingType;
  outlet_id?: string;
  department_id?: string;
  employee_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
}

export interface OffboardingStartInput {
  offboarding_type: OffboardingType;
  effective_exit_date: string;
  reason: string;
  notes?: string | null;
  create_default_tasks: boolean;
}

export interface OffboardingUpdateInput {
  notes?: string | null;
  status?: Extract<OffboardingCaseStatus, "draft" | "in_progress" | "pending_clearance">;
}

export interface OffboardingActionInput {
  reason?: string;
  notes?: string | null;
}

export interface OffboardingCaseRecord {
  id: string;
  company_id: string;
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
  initiated_by?: string | null;
  initiated_by_name?: string | null;
  initiated_at: string;
  completed_by?: string | null;
  completed_at?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  final_settlement_status: string;
  final_settlement_payroll_run_id?: string | null;
  task_total?: number;
  task_completed?: number;
  task_pending?: number;
  created_at: string;
  updated_at: string;
}

export interface OffboardingTaskRecord {
  id: string;
  company_id: string;
  offboarding_case_id: string;
  employee_id: string;
  task_type: OffboardingTaskType;
  title: string;
  description?: string | null;
  status: OffboardingTaskStatus;
  required: number;
  due_date?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalSettlementDraftRecord {
  id: string;
  company_id: string;
  employee_id: string;
  offboarding_case_id: string;
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
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OffboardingEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  employment_status: string;
  joined_at?: string | null;
  deleted_at?: string | null;
}

export interface OffboardingTaskSeed {
  taskType: OffboardingTaskType;
  title: string;
  description?: string | null;
  required: boolean;
  dueDate?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}
