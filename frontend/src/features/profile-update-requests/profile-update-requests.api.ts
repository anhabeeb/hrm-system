import { api } from "@/lib/api-client";
import type { Pagination } from "@/types/api";

export interface ProfileUpdateRequest {
  id: string;
  user_id: string;
  employee_id: string | null;
  request_type: string;
  old_value_json: string | null;
  requested_value_json: string;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdateRequestFilters {
  status?: string;
  request_type?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

const query = (filters: ProfileUpdateRequestFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
};

export const profileUpdateRequestsApi = {
  list: (filters: ProfileUpdateRequestFilters = {}) =>
    api.get<ProfileUpdateRequest[]>(`/profile-update-requests?${query(filters)}`) as Promise<{
      success: true;
      data: ProfileUpdateRequest[];
      pagination?: Pagination;
      message?: string;
    }>,
  detail: (id: string) => api.get<{ request: ProfileUpdateRequest }>(`/profile-update-requests/${id}`),
  approve: (id: string, input: { reason: string; review_notes?: string }) =>
    api.post<Record<string, unknown>>(`/profile-update-requests/${id}/approve`, input),
  reject: (id: string, input: { reason: string; review_notes?: string }) =>
    api.post<Record<string, unknown>>(`/profile-update-requests/${id}/reject`, input),
};
