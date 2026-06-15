import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { redactSensitiveValue } from "./document-sanitize";
import type { DocumentCategory, DocumentFilters, DocumentKycRequestPayload, DocumentKycRequestRecord, DocumentRecord, DocumentUpdatePayload, DocumentUploadPayload, MissingDocumentRecord } from "./documents.types";

const sanitizeRows = <T>(rows: T[]) => rows.map((row) => redactSensitiveValue(row) as T);

export const documentsApi = {
  list: async (filters: DocumentFilters = {}) => {
    const response = await api.get<DocumentRecord[]>(`/documents${buildQueryString(filters)}`);
    return { ...response, data: sanitizeRows(response.data) };
  },
  get: async (id: string) => {
    const response = await api.get<DocumentRecord>(`/documents/${id}`);
    return { ...response, data: redactSensitiveValue(response.data) as DocumentRecord };
  },
  upload: (payload: DocumentUploadPayload) => api.post<DocumentRecord>("/documents/upload", payload),
  update: (id: string, payload: DocumentUpdatePayload) => api.patch<DocumentRecord>(`/documents/${id}`, payload),
  delete: (id: string, reason: string) => api.delete<{ deleted: boolean }>(`/documents/${id}`, { reason }),
  download: (id: string) => api.download(`/documents/${id}/download`),
  expiring: async (filters: DocumentFilters = {}) => {
    const response = await api.get<DocumentRecord[]>(`/documents/expiring${buildQueryString(filters)}`);
    return { ...response, data: sanitizeRows(response.data) };
  },
  missing: (filters: DocumentFilters = {}) => api.get<MissingDocumentRecord[]>(`/documents/missing${buildQueryString(filters)}`),
  categories: (filters: DocumentFilters = {}) => api.get<DocumentCategory[]>(`/documents/categories${buildQueryString(filters)}`),
  createCategory: (payload: Partial<DocumentCategory> & { reason?: string }) => api.post<DocumentCategory>("/documents/categories", payload),
  updateCategory: (id: string, payload: Partial<DocumentCategory> & { reason?: string }) => api.patch<DocumentCategory>(`/documents/categories/${id}`, payload),
  listKycRequests: (filters: Record<string, unknown> = {}) => api.get<DocumentKycRequestRecord[]>(`/documents/kyc-requests${buildQueryString(filters)}`),
  createKycRequest: (payload: DocumentKycRequestPayload) => api.post<{ document_kyc_request: DocumentKycRequestRecord }>("/documents/kyc-requests", payload),
  submitKycRequest: (id: string) => api.post<{ document_kyc_request: DocumentKycRequestRecord; already_submitted?: boolean }>(`/documents/kyc-requests/${id}/submit`),
  approveKycRequest: (id: string, reason: string) => api.post<{ document_kyc_request: DocumentKycRequestRecord }>(`/documents/kyc-requests/${id}/approve`, { reason }),
  rejectKycRequest: (id: string, reason: string) => api.post<{ document_kyc_request: DocumentKycRequestRecord }>(`/documents/kyc-requests/${id}/reject`, { reason }),
  cancelKycRequest: (id: string, reason: string) => api.post<{ document_kyc_request: DocumentKycRequestRecord }>(`/documents/kyc-requests/${id}/cancel`, { reason }),
  applyKycRequest: (id: string, reason: string) => api.post<{ document_kyc_request: DocumentKycRequestRecord }>(`/documents/kyc-requests/${id}/apply`, { reason }),
  kycTimeline: (id: string) => api.get(`/documents/kyc-requests/${id}/timeline`),
  kycAudit: (id: string) => api.get(`/documents/kyc-requests/${id}/audit`),
};
