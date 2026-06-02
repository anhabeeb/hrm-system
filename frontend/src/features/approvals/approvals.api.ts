import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { sanitizeApprovalPayload } from "./approval-sanitize";
import type { ApprovalFilters, ApprovalHistory, ApprovalRequest, ApprovalStep, ApprovalThreshold, ApprovalWorkflow, ThresholdFilters, WorkflowFilters } from "./approvals.types";

const sanitizeApproval = (approval: ApprovalRequest): ApprovalRequest => ({
  ...approval,
  payload_json: sanitizeApprovalPayload(approval.payload_json),
});

export const approvalsApi = {
  list: async (filters: ApprovalFilters = {}) => {
    const response = await api.get<ApprovalRequest[]>(`/approvals${buildQueryString(filters)}`);
    return { ...response, data: response.data.map(sanitizeApproval) };
  },
  get: async (id: string) => {
    const response = await api.get<ApprovalRequest>(`/approvals/${id}`);
    return { ...response, data: sanitizeApproval(response.data) };
  },
  history: (id: string) => api.get<ApprovalHistory[]>(`/approvals/${id}/history`),
  approve: (id: string, reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/reject`, { reason }),
  returnForInfo: (id: string, reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/return`, { reason }),
  override: (id: string, decision: "approve" | "reject", reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/override`, { decision, reason }),
  workflows: (filters: WorkflowFilters = {}) => api.get<ApprovalWorkflow[]>(`/approvals/workflows${buildQueryString(filters)}`),
  getWorkflow: (id: string) => api.get<ApprovalWorkflow>(`/approvals/workflows/${id}`),
  createWorkflow: (payload: Partial<ApprovalWorkflow> & { reason?: string }) => api.post<ApprovalWorkflow>("/approvals/workflows", payload),
  updateWorkflow: (id: string, payload: Partial<ApprovalWorkflow> & { reason?: string }) => api.patch<ApprovalWorkflow>(`/approvals/workflows/${id}`, payload),
  enableWorkflow: (id: string, reason: string) => api.post<ApprovalWorkflow>(`/approvals/workflows/${id}/enable`, { reason }),
  disableWorkflow: (id: string, reason: string) => api.post<ApprovalWorkflow>(`/approvals/workflows/${id}/disable`, { reason }),
  steps: (workflowId: string) => api.get<ApprovalStep[]>(`/approvals/workflows/${workflowId}/steps`),
  createStep: (workflowId: string, payload: Partial<ApprovalStep> & { reason?: string }) => api.post<ApprovalStep>(`/approvals/workflows/${workflowId}/steps`, payload),
  updateStep: (workflowId: string, stepId: string, payload: Partial<ApprovalStep> & { reason?: string }) => api.patch<ApprovalStep>(`/approvals/workflows/${workflowId}/steps/${stepId}`, payload),
  deleteStep: (workflowId: string, stepId: string, reason: string) => api.delete<{ deleted: boolean }>(`/approvals/workflows/${workflowId}/steps/${stepId}`, { reason }),
  thresholds: (filters: ThresholdFilters = {}) => api.get<ApprovalThreshold[]>(`/approvals/thresholds${buildQueryString(filters)}`),
  createThreshold: (payload: Partial<ApprovalThreshold> & { reason?: string }) => api.post<ApprovalThreshold>("/approvals/thresholds", payload),
  updateThreshold: (id: string, payload: Partial<ApprovalThreshold> & { reason?: string }) => api.patch<ApprovalThreshold>(`/approvals/thresholds/${id}`, payload),
  enableThreshold: (id: string, reason: string) => api.post<ApprovalThreshold>(`/approvals/thresholds/${id}/enable`, { reason }),
  disableThreshold: (id: string, reason: string) => api.post<ApprovalThreshold>(`/approvals/thresholds/${id}/disable`, { reason }),
  thresholdHistory: (id: string) => api.get<ApprovalHistory[]>(`/approvals/thresholds/${id}/history`),
  settingsSummary: () => api.get<Record<string, unknown>>("/approvals/settings-summary"),
  myPendingCount: () => api.get<{ pending_count?: number; count?: number }>("/approvals/my-pending-count"),
};
