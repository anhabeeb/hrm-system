import type { CONTRACT_STATUSES, CONTRACT_TYPES } from "./employee-contracts.constants";

export type ContractType = (typeof CONTRACT_TYPES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractEmployeeRecord {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  employee_type: string;
  primary_outlet_id: string | null;
  department_id: string | null;
  position_id: string | null;
  deleted_at: string | null;
}

export interface EmployeeContractRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_code?: string | null;
  employee_name?: string | null;
  employee_type?: string | null;
  outlet_id?: string | null;
  outlet_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  contract_number: string | null;
  contract_type: ContractType;
  contract_status: ContractStatus;
  effective_status?: ContractStatus;
  start_date: string;
  end_date: string | null;
  signed_date: string | null;
  probation_end_date: string | null;
  renewal_of_contract_id: string | null;
  version_number: number;
  document_id: string | null;
  document?: {
    id: string;
    document_type: string;
    file_name: string | null;
    expiry_date: string | null;
    status: string | null;
  } | null;
  salary_snapshot_amount: number | null;
  currency: string | null;
  notes: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  days_until_expiry?: number | null;
  warning?: string | null;
}

export interface ContractListFilters {
  employee_id?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  contract_type?: ContractType;
  contract_status?: ContractStatus;
  expiring_within_days?: number;
  expired?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  page: number;
  page_size: number;
}

export interface ContractCreateInput {
  contract_number?: string | null;
  contract_type: ContractType;
  contract_status?: ContractStatus;
  start_date: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  document_id?: string | null;
  salary_snapshot_amount?: number | null;
  currency?: string | null;
  position_id?: string | null;
  department_id?: string | null;
  outlet_id?: string | null;
  notes?: string | null;
  reason: string;
}

export interface ContractUpdateInput {
  contract_number?: string | null;
  contract_type?: ContractType;
  contract_status?: ContractStatus;
  start_date?: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  document_id?: string | null;
  salary_snapshot_amount?: number | null;
  currency?: string | null;
  position_id?: string | null;
  department_id?: string | null;
  outlet_id?: string | null;
  notes?: string | null;
  reason: string;
}

export interface ContractRenewInput {
  new_contract_number?: string | null;
  start_date: string;
  end_date?: string | null;
  signed_date?: string | null;
  probation_end_date?: string | null;
  document_id?: string | null;
  notes?: string | null;
  reason: string;
}

export interface ContractActionInput {
  reason: string;
  notes?: string | null;
}
