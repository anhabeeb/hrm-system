import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { ContractFilters, ContractPayload, ContractRenewPayload, EmployeeContract, EmployeeContractsResponse } from "./contracts.types";

export const contractsApi = {
  list: (filters: ContractFilters = {}) => api.get<EmployeeContract[]>(`/contracts${buildQueryString(filters)}`),
  employee: (employeeId: string) => api.get<EmployeeContractsResponse>(`/employees/${employeeId}/contracts`),
  get: (employeeId: string, contractId: string) => api.get<{ contract: EmployeeContract }>(`/employees/${employeeId}/contracts/${contractId}`),
  create: (employeeId: string, payload: ContractPayload) => api.post<{ contract: EmployeeContract }>(`/employees/${employeeId}/contracts`, payload),
  update: (employeeId: string, contractId: string, payload: Partial<ContractPayload> & { reason: string }) =>
    api.patch<{ contract: EmployeeContract }>(`/employees/${employeeId}/contracts/${contractId}`, payload),
  renew: (employeeId: string, contractId: string, payload: ContractRenewPayload) =>
    api.post<{ contract: EmployeeContract }>(`/employees/${employeeId}/contracts/${contractId}/renew`, payload),
  archive: (employeeId: string, contractId: string, payload: { reason: string; notes?: string | null }) =>
    api.post<{ contract: EmployeeContract }>(`/employees/${employeeId}/contracts/${contractId}/archive`, payload),
  history: (employeeId: string, contractId: string) =>
    api.get<{ contract: EmployeeContract; history: EmployeeContract[] }>(`/employees/${employeeId}/contracts/${contractId}/history`),
};
