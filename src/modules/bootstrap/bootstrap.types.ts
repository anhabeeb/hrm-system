export interface BootstrapCompanyInput {
  company_name: string;
  legal_name?: string | null;
  registration_number?: string | null;
  country: string;
  timezone: string;
  currency: string;
}

export interface BootstrapSuperAdminInput {
  full_name: string;
  email: string;
  password: string;
}

export interface BootstrapOutletInput {
  outlet_name: string;
  outlet_code?: string | null;
  is_primary?: boolean;
}

export interface BootstrapFeatureSelections {
  attendance?: boolean;
  roster?: boolean;
  contract_tracking?: boolean;
}

export interface BootstrapInitializeInput {
  company: BootstrapCompanyInput;
  super_admin: BootstrapSuperAdminInput;
  outlet?: BootstrapOutletInput;
  features?: BootstrapFeatureSelections;
}

export interface BootstrapStatus {
  setup_required: boolean;
  remember_me_allowed?: boolean;
}

export interface SystemBootstrapRow {
  id: string;
  is_initialized: number;
  company_id: string | null;
  initialized_by_user_id: string | null;
  initialized_at: string | null;
  created_at: string;
  updated_at: string;
}
