export interface CompanyRecord {
  id: string;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  currency: string;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfile {
  company_name: string;
  legal_name: string | null;
  registration_number: string | null;
  tax_number: string | null;
  company_email: string | null;
  company_phone: string | null;
  website: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  logo_url: string | null;
  updated_at: string;
}

export interface UpdateCompanyProfileInput extends Partial<Omit<CompanyProfile, "updated_at">> {
  reason: string;
}
