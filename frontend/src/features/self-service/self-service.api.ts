import { api } from "@/lib/api-client";
import type { SelfDashboard, SelfNavigationItem, SelfPendingApproval, SelfProfile, SelfRequest } from "./self-service.types";

export const selfServiceApi = {
  dashboard: () => api.get<SelfDashboard>("/self/dashboard"),
  profile: () => api.get<SelfProfile>("/self/profile"),
  accessSummary: () => api.get<Record<string, unknown>>("/self/access-summary"),
  navigation: () => api.get<SelfNavigationItem[]>("/self/navigation"),
  requests: () => api.get<SelfRequest[]>("/self/requests"),
  pendingApprovals: () => api.get<SelfPendingApproval[]>("/self/pending-approvals"),
};
