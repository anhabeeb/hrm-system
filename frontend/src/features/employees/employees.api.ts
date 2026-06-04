import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { DocumentUpdatePayload, DocumentUploadPayload } from "@/features/documents/documents.types";
import type { Employee, EmployeeDetailResponse, EmployeeDocumentCompliance, EmployeeDocumentRow, EmployeeFilters, EmployeeNoteRow, EmployeePayload, EmployeeSalaryRow, EmployeeUpdatePayload } from "./employees.types";

export const employeesApi = {
  list: (filters: EmployeeFilters) => api.get<Employee[]>(`/employees${buildQueryString(filters)}`),
  get: (id: string) => api.get<EmployeeDetailResponse>(`/employees/${id}`),
  create: (payload: EmployeePayload) => api.post<{ employee: Employee } | { id: string }>("/employees", payload),
  update: (id: string, payload: EmployeeUpdatePayload) => api.patch<{ employee: Employee } | { updated: boolean }>(`/employees/${id}`, payload),
  salaryHistory: (id: string) => api.get<{ history: EmployeeSalaryRow[] }>(`/employees/${id}/salary-history`),
  documents: (id: string) => api.get<{ documents: EmployeeDocumentRow[]; compliance?: EmployeeDocumentCompliance }>(`/employees/${id}/documents`),
  document: (employeeId: string, documentId: string) => api.get<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}`),
  uploadDocument: (employeeId: string, payload: Omit<DocumentUploadPayload, "employee_id">) => api.post<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents`, payload),
  updateDocument: (employeeId: string, documentId: string, payload: DocumentUpdatePayload) => api.patch<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}`, payload),
  replaceDocument: (employeeId: string, documentId: string, payload: Omit<DocumentUploadPayload, "employee_id"> & { reason: string }) => api.post<{ document: EmployeeDocumentRow; previous_document_id: string }>(`/employees/${employeeId}/documents/${documentId}/replace`, payload),
  archiveDocument: (employeeId: string, documentId: string, reason: string) => api.post<{ document: EmployeeDocumentRow }>(`/employees/${employeeId}/documents/${documentId}/archive`, { reason }),
  documentHistory: (employeeId: string, documentId: string) => api.get<{ history: EmployeeDocumentRow[] }>(`/employees/${employeeId}/documents/${documentId}/history`),
  notes: (id: string) => api.get<{ notes: EmployeeNoteRow[] }>(`/employees/${id}/notes`),
};
