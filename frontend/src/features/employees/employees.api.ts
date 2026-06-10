import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { DocumentUpdatePayload, DocumentUploadPayload } from "@/features/documents/documents.types";
import type { ApplyLevelRoleTemplateResult, CompensationComponentDefinition, CompensationComponentDefinitionPayload, Employee, Employee360Profile, EmployeeCompensationComponent, EmployeeCompensationComponentEndPayload, EmployeeCompensationComponentMutationResponse, EmployeeCompensationComponentPayload, EmployeeCompensationSummary, EmployeeDetailResponse, EmployeeDocumentCompliance, EmployeeDocumentRow, EmployeeFilters, EmployeeJobChangePayload, EmployeeJobChangeResponse, EmployeeJobHistoryRow, EmployeeLoginCreatePayload, EmployeeLoginCreateResponse, EmployeeLoginDetails, EmployeeLoginLinkCandidate, EmployeeLoginLinkExistingPayload, EmployeeLoginResetPasswordPayload, EmployeeLoginUpdatePayload, EmployeeNoteRow, EmployeePayload, EmployeeSalaryChangePayload, EmployeeSalaryChangeResponse, EmployeeSalaryRow, EmployeeStatusChangePayload, EmployeeStatusHistoryRow, EmployeeStructure, EmployeeStructureHistoryRow, EmployeeStructurePayload, EmployeeUpdatePayload } from "./employees.types";

export const employeesApi = {
  list: (filters: EmployeeFilters) => api.get<Employee[]>(`/employees${buildQueryString(filters)}`),
  get: (id: string) => api.get<EmployeeDetailResponse>(`/employees/${id}`),
  profile: (id: string, filters: { limit?: number } = {}) => api.get<Employee360Profile>(`/employees/${id}/profile${buildQueryString(filters)}`),
  profileSummary: (id: string) => api.get<{ data: Employee360Profile["summary"] }>(`/employees/${id}/profile/summary`),
  profileAttendance: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["attendance"] }>(`/employees/${id}/profile/attendance${buildQueryString(filters)}`),
  profileLeave: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["leave"] }>(`/employees/${id}/profile/leave${buildQueryString(filters)}`),
  profileLongLeave: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["long_leave"] }>(`/employees/${id}/profile/long-leave${buildQueryString(filters)}`),
  profileDocuments: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["documents"] }>(`/employees/${id}/profile/documents${buildQueryString(filters)}`),
  profileContracts: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["contracts"] }>(`/employees/${id}/profile/contracts${buildQueryString(filters)}`),
  profileAssets: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["assets"] }>(`/employees/${id}/profile/assets${buildQueryString(filters)}`),
  profilePayrollReadiness: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["payroll_readiness"] }>(`/employees/${id}/profile/payroll-readiness${buildQueryString(filters)}`),
  profileAlerts: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["alerts"] }>(`/employees/${id}/profile/alerts${buildQueryString(filters)}`),
  profileTimeline: (id: string, filters: { limit?: number } = {}) => api.get<{ data: Employee360Profile["timeline"] }>(`/employees/${id}/profile/timeline${buildQueryString(filters)}`),
  create: (payload: EmployeePayload) => api.post<{ employee: Employee } | { id: string }>("/employees", payload),
  update: (id: string, payload: EmployeeUpdatePayload) => api.patch<{ employee: Employee } | { updated: boolean }>(`/employees/${id}`, payload),
  login: (id: string) =>
    api.get<{ login: EmployeeLoginDetails | null }>(`/employees/${id}/login`),
  loginLinkCandidates: (filters: { search?: string; employee_id?: string; page?: number; page_size?: number }) =>
    api.get<EmployeeLoginLinkCandidate[]>(`/employees/login-link-candidates${buildQueryString(filters)}`),
  createLogin: (id: string, payload: EmployeeLoginCreatePayload) =>
    api.post<EmployeeLoginCreateResponse>(`/employees/${id}/login`, payload),
  updateLogin: (id: string, payload: EmployeeLoginUpdatePayload) =>
    api.patch<EmployeeLoginDetails>(`/employees/${id}/login`, payload),
  disableLogin: (id: string) =>
    api.post<EmployeeLoginDetails>(`/employees/${id}/login/disable`, {}),
  enableLogin: (id: string) =>
    api.post<EmployeeLoginDetails>(`/employees/${id}/login/enable`, {}),
  resetLoginPassword: (id: string, payload: EmployeeLoginResetPasswordPayload) =>
    api.post<EmployeeLoginDetails>(`/employees/${id}/login/reset-password`, payload),
  linkExistingLogin: (id: string, payload: EmployeeLoginLinkExistingPayload) =>
    api.post<EmployeeLoginDetails>(`/employees/${id}/login/link-existing`, payload),
  structure: (id: string) => api.get<{ structure: EmployeeStructure }>(`/employees/${id}/structure`),
  updateStructure: (id: string, payload: EmployeeStructurePayload) =>
    api.patch<{ structure: EmployeeStructure }>(`/employees/${id}/structure`, payload),
  structureHistory: (id: string) =>
    api.get<{ history: EmployeeStructureHistoryRow[] }>(`/employees/${id}/structure-history`),
  applyLevelRoleTemplate: (id: string) =>
    api.post<ApplyLevelRoleTemplateResult>(`/employees/${id}/apply-level-role-template`, {}),
  statusHistory: (id: string) => api.get<{ history: EmployeeStatusHistoryRow[] }>(`/employees/${id}/status-history`),
  changeStatus: (id: string, payload: EmployeeStatusChangePayload) =>
    api.post<{ employee: Employee; status_history: EmployeeStatusHistoryRow | null; updated: boolean; scheduled?: boolean }>(`/employees/${id}/status-change`, payload),
  jobHistory: (id: string) => api.get<{ history: EmployeeJobHistoryRow[] }>(`/employees/${id}/job-history`),
  createJobChange: (id: string, payload: EmployeeJobChangePayload) =>
    api.post<EmployeeJobChangeResponse>(`/employees/${id}/job-change`, payload),
  salaryHistory: (id: string) => api.get<{ history: EmployeeSalaryRow[] }>(`/employees/${id}/salary-history`),
  addSalaryHistory: (id: string, payload: EmployeeSalaryChangePayload) =>
    api.post<EmployeeSalaryChangeResponse>(`/employees/${id}/salary-history`, payload),
  compensationSummary: (id: string) =>
    api.get<{ summary: EmployeeCompensationSummary }>(`/employees/${id}/compensation-summary`),
  compensationComponents: (id: string) =>
    api.get<{ components: EmployeeCompensationComponent[] }>(`/employees/${id}/compensation-components`),
  addCompensationComponent: (id: string, payload: EmployeeCompensationComponentPayload) =>
    api.post<EmployeeCompensationComponentMutationResponse>(`/employees/${id}/compensation-components`, payload),
  changeCompensationComponent: (id: string, componentId: string, payload: EmployeeCompensationComponentPayload) =>
    api.patch<EmployeeCompensationComponentMutationResponse>(`/employees/${id}/compensation-components/${componentId}`, payload),
  endCompensationComponent: (id: string, componentId: string, payload: EmployeeCompensationComponentEndPayload) =>
    api.post<EmployeeCompensationComponentMutationResponse>(`/employees/${id}/compensation-components/${componentId}/end`, payload),
  documents: (id: string) => api.get<{ documents: EmployeeDocumentRow[]; compliance?: EmployeeDocumentCompliance }>(`/employees/${id}/documents`),
  document: (employeeId: string, documentId: string) => api.get<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}`),
  uploadDocument: (employeeId: string, payload: Omit<DocumentUploadPayload, "employee_id">) => api.post<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents`, payload),
  updateDocument: (employeeId: string, documentId: string, payload: DocumentUpdatePayload) => api.patch<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}`, payload),
  replaceDocument: (employeeId: string, documentId: string, payload: Omit<DocumentUploadPayload, "employee_id"> & { reason: string }) => api.post<{ document: EmployeeDocumentRow; previous_document_id: string }>(`/employees/${employeeId}/documents/${documentId}/replace`, payload),
  archiveDocument: (employeeId: string, documentId: string, reason: string) => api.post<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}/archive`, { reason }),
  documentHistory: (employeeId: string, documentId: string) => api.get<{ history: EmployeeDocumentRow[] }>(`/employees/${employeeId}/documents/${documentId}/history`),
  notes: (id: string) => api.get<{ notes: EmployeeNoteRow[] }>(`/employees/${id}/notes`),
};

export const compensationDefinitionsApi = {
  list: (filters: { search?: string; component_type?: string; status?: string; page?: number; page_size?: number } = {}) =>
    api.get<CompensationComponentDefinition[]>(`/compensation-component-definitions${buildQueryString(filters)}`),
  create: (payload: CompensationComponentDefinitionPayload) =>
    api.post<{ definition: CompensationComponentDefinition }>("/compensation-component-definitions", payload),
  update: (id: string, payload: CompensationComponentDefinitionPayload) =>
    api.patch<{ definition: CompensationComponentDefinition }>(`/compensation-component-definitions/${id}`, payload),
  enable: (id: string, reason: string) =>
    api.post<{ definition: CompensationComponentDefinition }>(`/compensation-component-definitions/${id}/enable`, { reason }),
  disable: (id: string, reason: string) =>
    api.post<{ definition: CompensationComponentDefinition }>(`/compensation-component-definitions/${id}/disable`, { reason }),
};
