import type { PaginationMeta } from "../../types/api.types";

export interface ApprovalOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
  userId: string;
  roleKeys: string[];
  permissions: string[];
}

export interface ApprovalListFilters {
  status?: string;
  module?: string;
  workflow_id?: string;
  workflow_key?: string;
  entity_type?: string;
  entity_id?: string;
  employee_id?: string;
  outlet_id?: string;
  requested_by?: string;
  current_step?: number;
  date_from?: string;
  date_to?: string;
  assigned_to_me?: boolean;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
}

export interface ApprovalActionInput {
  reason: string;
  comment?: string;
}

export interface ApprovalOverrideInput extends ApprovalActionInput {
  decision: "approve" | "reject";
}

export interface WorkflowInput {
  workflow_key: string;
  workflow_name: string;
  module: string;
  approval_mode?: string;
  reason?: string;
}

export interface WorkflowUpdateInput extends Partial<WorkflowInput> {
  is_enabled?: boolean;
}

export interface StepInput {
  step_order: number;
  step_name: string;
  required_role_key?: string | null;
  required_permission_key?: string | null;
  is_required?: boolean;
  approval_type?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  reason?: string;
}

export interface ThresholdInput {
  workflow_key: string;
  threshold_name: string;
  threshold_type: string;
  amount_min?: number | null;
  amount_max?: number | null;
  percentage_min?: number | null;
  percentage_max?: number | null;
  currency?: string;
  required_roles_json?: string | null;
  required_permissions_json?: string | null;
  effective_from?: string | null;
  reason?: string;
}

export interface ThresholdFilters {
  workflow_key?: string;
  threshold_type?: string;
  is_active?: boolean;
  page: number;
  page_size: number;
}

export interface WorkflowFilters {
  module?: string;
  workflow_key?: string;
  is_enabled?: boolean;
  page: number;
  page_size: number;
}

export interface ApprovalListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
