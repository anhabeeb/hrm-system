import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { SalaryLoan, SalaryLoanFilters, SalaryLoanInstallment, SalaryLoanPayload } from "./salary-loans.types";

export const salaryLoansApi = {
  list: (filters: SalaryLoanFilters = {}) => api.get<SalaryLoan[]>(`/salary-loans${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ salary_loan: SalaryLoan }>(`/salary-loans/${id}`),
  create: (payload: SalaryLoanPayload) => api.post<{ salary_loan?: SalaryLoan }>("/salary-loans", payload),
  update: (id: string, payload: Partial<SalaryLoanPayload>) => api.patch<{ salary_loan?: SalaryLoan }>(`/salary-loans/${id}`, payload),
  approve: (id: string, reason: string) => api.post<{ approved: boolean }>(`/salary-loans/${id}/approve`, { reason }),
  pause: (id: string, reason: string) => api.post<{ paused: boolean }>(`/salary-loans/${id}/pause`, { reason }),
  settle: (id: string, reason: string) => api.post<{ settled: boolean }>(`/salary-loans/${id}/settle`, { reason }),
  installments: (id: string) => api.get<{ installments: SalaryLoanInstallment[] }>(`/salary-loans/${id}/installments`),
};
