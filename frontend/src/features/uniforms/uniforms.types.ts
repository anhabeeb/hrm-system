export interface UniformRecord {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  outlet_id?: string;
  outlet_name?: string;
  uniform_type?: string;
  quantity?: number;
  issued_date?: string;
  returned_date?: string | null;
  status?: string;
  created_at?: string;
}

export interface UniformFilters {
  employee_id?: string;
  outlet_id?: string;
  uniform_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface UniformIssuePayload {
  employee_id: string;
  outlet_id?: string;
  uniform_type: string;
  quantity: number;
  issued_date: string;
  reason?: string;
}

export interface UniformReturnPayload {
  returned_date: string;
  reason: string;
}
