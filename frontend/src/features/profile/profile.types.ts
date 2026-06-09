import type { CurrentUser } from "@/types/auth";

export interface SecuritySummary {
  password_updated_at?: string | null;
  two_factor_enabled?: boolean;
  enabled?: boolean;
  verified_at?: string | null;
  backup_codes_remaining?: number;
  active_sessions_count?: number;
  last_login_at?: string | null;
}

export interface ActiveSession {
  id: string;
  current: boolean;
  device_label: string | null;
  user_agent_summary: string | null;
  ip_summary: string | null;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export interface TwoFactorSetupResponse {
  otpauth_url: string;
  manual_key: string;
  manual_setup_key: string;
  qr_code_data_url?: string | null;
}

export interface TwoFactorVerifyResponse {
  enabled?: boolean;
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
