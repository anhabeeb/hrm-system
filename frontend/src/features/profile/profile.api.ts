import { api } from "@/lib/api-client";

import type {
  KycRequestRecord,
  ProfileResponse,
  SecuritySummary,
  TwoFactorSetupResponse,
  TwoFactorVerifyResponse,
} from "./profile.types";

export const profileApi = {
  me: () => api.get<ProfileResponse>("/me"),
  security: () => api.get<SecuritySummary>("/me/security"),
  changePassword: (input: { current_password: string; new_password: string; confirm_password: string }) =>
    api.post<Record<string, never>>("/me/change-password", input),
  setupTwoFactor: () => api.post<TwoFactorSetupResponse>("/me/2fa/setup"),
  verifyTwoFactor: (code: string) => api.post<TwoFactorVerifyResponse>("/me/2fa/verify", { code }),
  disableTwoFactor: (input: { password?: string; code?: string }) =>
    api.post<Record<string, never>>("/me/2fa/disable", input),
  listKycRequests: () => api.get<KycRequestRecord[]>("/me/kyc-requests"),
  createKycRequest: (input: { request_type: string; requested_value_json: unknown; reason: string }) =>
    api.post<{ id: string; status: string }>("/me/kyc-requests", input),
};
