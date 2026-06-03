import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { redactSensitiveValue } from "./document-sanitize";
import type { DocumentCategory, DocumentFilters, DocumentRecord, DocumentUpdatePayload, DocumentUploadPayload, MissingDocumentRecord } from "./documents.types";

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
};
