import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { Pagination } from "@/types/api";

export interface LookupOption {
  id: string;
  code?: string | null;
  name: string;
  label: string;
  status?: string | null;
  payroll_month?: string;
}

export interface LookupResponse {
  data: LookupOption[];
  pagination?: Pagination;
}

export interface LookupFilters {
  search?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  status?: string;
  is_enabled?: string;
  mode?: string;
  page?: number;
  page_size?: number;
  limit?: number;
}

const lookup = (path: string, filters: LookupFilters = {}) =>
  api.get<LookupOption[]>(`${path}${buildQueryString({ page_size: 20, ...filters })}`);

export const lookupApi = {
  employees: (filters?: LookupFilters) => lookup("/lookups/employees", filters),
  outlets: (filters?: LookupFilters) => lookup("/lookups/outlets", filters),
  departments: (filters?: LookupFilters) => lookup("/lookups/departments", filters),
  positions: (filters?: LookupFilters) => lookup("/lookups/positions", filters),
  leaveTypes: (filters?: LookupFilters) => lookup("/lookups/leave-types", filters),
  payrollPeriods: (filters?: LookupFilters) => lookup("/lookups/payroll-periods", filters),
};
