import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  EmployeeOffboardingResponse,
  OffboardingCase,
  OffboardingCaseDetail,
  OffboardingFilters,
  StartOffboardingPayload,
} from "./offboarding.types";

export const offboardingApi = {
  list: (filters: OffboardingFilters = {}) => api.get<OffboardingCase[]>(`/offboarding-cases${buildQueryString(filters)}`),
  employee: (employeeId: string) => api.get<EmployeeOffboardingResponse>(`/employees/${employeeId}/offboarding`),
  start: (employeeId: string, payload: StartOffboardingPayload) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/start`, payload),
  get: (employeeId: string, caseId: string) =>
    api.get<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}`),
  update: (employeeId: string, caseId: string, payload: { status?: string; notes?: string | null }) =>
    api.patch<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}`, payload),
  completeTask: (employeeId: string, caseId: string, taskId: string, payload: { reason?: string; notes?: string | null }) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/tasks/${taskId}/complete`, payload),
  waiveTask: (employeeId: string, caseId: string, taskId: string, payload: { reason: string }) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/tasks/${taskId}/waive`, payload),
  cancel: (employeeId: string, caseId: string, reason: string) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/cancel`, { reason }),
  prepareSettlement: (employeeId: string, caseId: string, reason?: string) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/prepare-final-settlement`, { reason }),
  markReady: (employeeId: string, caseId: string, reason?: string) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/mark-ready`, { reason }),
  complete: (employeeId: string, caseId: string, reason: string) =>
    api.post<OffboardingCaseDetail>(`/employees/${employeeId}/offboarding/${caseId}/complete`, { reason }),
};
