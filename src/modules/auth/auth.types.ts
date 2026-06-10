export interface UserRecord {
  id: string;
  company_id: string;
  employee_id: string | null;
  username?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  password_algo: string;
  password_updated_at: string | null;
  password_reset_required: number;
  failed_login_attempts: number;
  locked_until: string | null;
  last_password_reset_at: string | null;
  two_factor_enabled: number;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SafeUserProfile {
  id: string;
  company_id: string;
  employee_id: string | null;
  username: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  two_factor_enabled: boolean;
  password_reset_required?: boolean;
  last_login_at?: string | null;
  password_updated_at?: string | null;
}

export interface SessionRecord {
  id: string;
  company_id: string;
  user_id: string;
  session_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  device_id: string | null;
  expires_at: string;
  remember_me: number;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  device_label?: string | null;
  user_agent_summary?: string | null;
  ip_summary?: string | null;
  revoked_reason?: string | null;
  revoked_by?: string | null;
}

export interface SafeSessionRecord {
  id: string;
  current: boolean;
  device_label: string | null;
  user_agent_summary: string | null;
  ip_summary: string | null;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  remember_me?: boolean;
  revoked_at: string | null;
}

export interface PasswordResetTokenRecord {
  id: string;
  company_id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface TwoFactorRecord {
  id: string;
  company_id: string;
  user_id: string;
  method: string;
  secret_encrypted: string | null;
  backup_codes_hash_json: string | null;
  enabled_at: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupCodeRecord {
  hash: string;
  used_at: string | null;
}

export interface LoginInput {
  identifier?: string;
  email?: string;
  password: string;
  remember_me?: boolean;
  totp_code?: string;
  backup_code?: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface TwoFactorVerifyInput {
  code: string;
}

export interface TwoFactorChallengeVerifyInput {
  challenge_id: string;
  code?: string;
  backup_code?: string;
}

export interface TwoFactorDisableInput {
  password?: string;
  code?: string;
}

export interface BackupCodeInput {
  email?: string;
  backup_code: string;
}

export interface KycUpdateRequestInput {
  request_type: string;
  requested_value_json: unknown;
  reason?: string;
}

export interface KycRequestRecord {
  id: string;
  company_id: string;
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

export interface AuthenticatedRequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
}
