import type {
  ALLOWED_PROFILE_UPDATE_REQUEST_TYPES,
  PROFILE_UPDATE_REQUEST_STATUSES,
} from "./profile-update-requests.constants";

export type ProfileUpdateRequestStatus =
  (typeof PROFILE_UPDATE_REQUEST_STATUSES)[number];
export type ProfileUpdateRequestType =
  (typeof ALLOWED_PROFILE_UPDATE_REQUEST_TYPES)[number];

export interface ProfileUpdateRequestRecord {
  id: string;
  company_id: string;
  user_id: string;
  employee_id: string | null;
  request_type: ProfileUpdateRequestType;
  old_value_json: string | null;
  requested_value_json: string;
  reason: string | null;
  status: ProfileUpdateRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdateRequestFilters {
  status?: ProfileUpdateRequestStatus;
  request_type?: ProfileUpdateRequestType;
  user_id?: string;
  employee_id?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
  sort_by: "created_at" | "updated_at" | "status" | "request_type";
  sort_direction: "asc" | "desc";
}

export interface ReviewInput {
  reason: string;
  review_notes: string;
}
