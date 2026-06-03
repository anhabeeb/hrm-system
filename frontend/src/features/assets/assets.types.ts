export interface AssetRecord {
  id: string;
  asset_code?: string;
  asset_name?: string;
  asset_type?: string;
  outlet_id?: string | null;
  outlet_name?: string | null;
  status?: string;
  current_condition?: string | null;
  assigned_employee_id?: string | null;
  assigned_employee_name?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  holder_name?: string | null;
  purchase_value_amount?: number | null;
  value_minor_units?: number | null;
  purchase_date?: string | null;
  issued_date?: string | null;
  returned_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssetDeduction {
  id: string;
  asset_id?: string;
  asset_code?: string;
  asset_name?: string;
  employee_id?: string;
  employee_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  amount?: number;
  deduction_amount?: number;
  deduction_month?: string | null;
  status?: string;
  approval_status?: string;
  approval_request_id?: string | null;
  created_at?: string;
}

export interface AssetFilters {
  search?: string;
  outlet_id?: string;
  employee_id?: string;
  assigned_to?: string;
  asset_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface AssetDeductionFilters {
  outlet_id?: string;
  employee_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface AssetPayload {
  asset_code: string;
  asset_name: string;
  asset_type: string;
  outlet_id?: string;
  purchase_value_amount?: number;
  current_condition?: string;
}

export interface AssetAssignPayload {
  employee_id?: string;
  outlet_id?: string;
  issued_date: string;
  issue_condition?: string;
  reason: string;
}

export interface AssetReturnPayload {
  returned_date: string;
  return_condition?: string;
  reason: string;
}

export interface AssetMarkPayload {
  reason: string;
  request_deduction?: boolean;
  deduction_amount?: number;
  deduction_month?: string;
}

export interface AssetDeductionPayload {
  amount: number;
  deduction_month?: string;
  reason: string;
}
