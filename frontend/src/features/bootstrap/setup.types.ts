export interface SetupFormValues {
  company_name: string;
  legal_name?: string;
  registration_number?: string;
  country: string;
  timezone: string;
  currency: string;
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  include_outlet: boolean;
  outlet_name?: string;
  outlet_code?: string;
  is_primary: boolean;
  bootstrap_token: string;
}

export interface BootstrapInitializePayload {
  company: {
    company_name: string;
    legal_name?: string | null;
    registration_number?: string | null;
    country: string;
    timezone: string;
    currency: string;
  };
  super_admin: {
    full_name: string;
    email: string;
    password: string;
  };
  outlet?: {
    outlet_name: string;
    outlet_code?: string | null;
    is_primary: boolean;
  };
}
