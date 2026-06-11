import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import { sanitizeApprovalPayload } from "./approval-sanitize";
import type { ApprovalEngineRequest, ApprovalEngineTimeline, ApprovalFilters, ApprovalHistory, ApprovalRequest, ApprovalStep, ApprovalThreshold, ApprovalWorkflow, ThresholdFilters, WorkflowFilters } from "./approvals.types";

const sanitizeApproval = (approval: ApprovalRequest): ApprovalRequest => ({
  ...approval,
  can_approve: approval.can_approve ?? approval.actions_available?.can_approve,
  can_reject: approval.can_reject ?? approval.actions_available?.can_reject,
  can_return: approval.can_return ?? approval.actions_available?.can_return,
  can_cancel: approval.can_cancel ?? approval.actions_available?.can_cancel,
  can_override: approval.can_override ?? approval.actions_available?.can_override,
  can_retry: approval.can_retry ?? approval.actions_available?.can_retry,
  disabled_reason: approval.disabled_reason ?? approval.actions_available?.disabled_reason,
  payload_json: sanitizeApprovalPayload(approval.payload_json ?? approval.payload_summary),
  payload_summary: sanitizeApprovalPayload(approval.payload_summary ?? approval.payload_json),
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
  cancel: (id: string, reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/cancel`, { reason }),
  retry: (id: string, reason: string) => api.post<ApprovalRequest>(`/approvals/${id}/retry`, { reason }),
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
  engineRequests: (filters: ApprovalFilters = {}) => api.get<ApprovalEngineRequest[]>(`/approvals/requests${buildQueryString(filters)}`),
  engineRequest: (id: string) => api.get<ApprovalEngineRequest>(`/approvals/requests/${id}`),
  createEngineRequest: (payload: Partial<ApprovalEngineRequest> & Record<string, unknown>) => api.post<ApprovalEngineRequest>("/approvals/requests", payload),
  submitEngineRequest: (id: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/submit`, {}),
  approveEngineRequest: (id: string, comment?: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/approve`, { comment }),
  rejectEngineRequest: (id: string, reason: string, comment?: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/reject`, { reason, comment }),
  cancelEngineRequest: (id: string, reason?: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/cancel`, { reason }),
  escalateEngineRequest: (id: string, reason: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/escalate`, { reason }),
  assignEngineApprover: (id: string, stepId: string, userId: string, reason: string) => api.post<ApprovalEngineRequest>(`/approvals/requests/${id}/steps/${stepId}/assign`, { user_id: userId, reason }),
  engineTimeline: (id: string) => api.get<ApprovalEngineTimeline>(`/approvals/requests/${id}/timeline`),
  myPendingEngine: (filters: ApprovalFilters = {}) => api.get<ApprovalEngineRequest[]>(`/approvals/my-pending${buildQueryString(filters)}`),
  myRequestsEngine: (filters: ApprovalFilters = {}) => api.get<ApprovalEngineRequest[]>(`/approvals/my-requests${buildQueryString(filters)}`),
};
