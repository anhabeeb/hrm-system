import type { PaginationMeta } from "../../types/api.types";

export interface AssetOutletScope {
  isSuperAdmin: boolean;
  outletIds: string[];
}

export interface AssetListFilters {
  search?: string;
  outlet_id?: string;
  employee_id?: string;
  asset_type?: string;
  status?: string;
  current_condition?: string;
  assigned_to?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
}

export interface AssetCreateInput {
  asset_code: string;
  asset_name: string;
  asset_type: string;
  outlet_id?: string;
  purchase_value_amount?: number;
  current_condition?: string;
}

export interface AssetUpdateInput {
  asset_code?: string;
  asset_name?: string;
  asset_type?: string;
  outlet_id?: string | null;
  purchase_value_amount?: number | null;
  current_condition?: string | null;
}

export interface AssetAssignInput {
  employee_id?: string;
  outlet_id?: string;
  issued_date: string;
  issue_condition?: string;
  reason: string;
}

export interface AssetReturnInput {
  returned_date: string;
  return_condition?: string;
  reason: string;
}

export interface AssetMarkInput {
  reason: string;
  deduction_amount?: number;
  deduction_month?: string;
  request_deduction?: boolean;
}

export interface AssetDeductionRequestInput {
  amount: number;
  deduction_month?: string;
  reason: string;
}

export interface AssetDeductionActionInput {
  reason: string;
}

export interface AssetDeductionFilters {
  status?: string;
  employee_id?: string;
  outlet_id?: string;
  page: number;
  page_size: number;
}

export interface AssetListResult<T> {
  rows: T[];
  pagination: PaginationMeta;
}
