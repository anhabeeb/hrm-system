export type ContractType =
  | "permanent"
  | "fixed_term"
  | "probation"
  | "temporary"
  | "part_time"
  | "casual"
  | "foreign_worker_contract"
  | "other";

export type ContractStatus = "draft" | "active" | "expiring_soon" | "expired" | "renewed" | "archived" | "cancelled";

export interface EmployeeContract {
  id: string;
  employee_id: string;
  employee_code?: string | null;
  employee_name?: string | null;
  outlet_name?: string | null;
  department_name?: string | null;
  position_title?: string | null;
  contract_number?: string | null;
  contract_type: ContractType;
  contract_status: ContractStatus;
  start_date: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  renewal_of_contract_id?: string | null;
  version_number: number;
  document_id?: string | null;
  document?: { id: string; document_type: string; file_name?: string | null; expiry_date?: string | null; status?: string | null } | null;
  salary_snapshot_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  reason?: string | null;
  days_until_expiry?: number | null;
  warning?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractPayload {
  contract_number?: string | null;
  contract_type: ContractType;
  start_date: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  document_id?: string | null;
  salary_snapshot_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  reason: string;
}

export interface ContractRenewPayload {
  new_contract_number?: string | null;
  start_date: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  document_id?: string | null;
  notes?: string | null;
  reason: string;
}

export interface EmployeeContractsResponse {
  contracts: EmployeeContract[];
  current_contract?: EmployeeContract | null;
  warnings: string[];
  settings: Record<string, unknown>;
}

export interface ContractFilters {
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  contract_type?: string;
  contract_status?: string;
  expiring_within_days?: number;
  expired?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}
