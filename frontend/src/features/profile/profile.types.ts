import type { CurrentUser } from "@/types/auth";

export interface SecuritySummary {
  password_updated_at?: string | null;
  two_factor_enabled?: boolean;
  active_sessions_count?: number;
  last_login_at?: string | null;
}

export interface TwoFactorSetupResponse {
  otpauth_url: string;
  manual_setup_key: string;
}

export interface TwoFactorVerifyResponse {
  backup_codes?: string[];
}

export interface KycRequestRecord {
  id: string;
  request_type: string;
  requested_value_json: string;
  reason?: string | null;
  status: string;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  user: CurrentUser;
  roles: string[];
  permissions: string[];
  features?: string[];
  outlet_ids: string[];
}
