import { api } from "@/lib/api-client";

import type { LoginInput, LoginResult, MeResult } from "./auth.types";

export const authApi = {
  login: (input: LoginInput) => api.post<LoginResult>("/auth/login", input, { suppressSessionExpired: true }),
  verifyLoginTwoFactor: (input: { challenge_id: string; code: string }) =>
    api.post<LoginResult>("/auth/2fa/verify", input, { suppressSessionExpired: true }),
  logout: () => api.post<Record<string, never>>("/auth/logout"),
  me: () => api.get<MeResult>("/auth/me", { background: true }),
  verifyAuthenticatedTwoFactor: (code: string) => api.post<Record<string, never>>("/me/2fa/confirm", { code }),
  requestPasswordReset: (email: string) => api.post<Record<string, unknown>>("/auth/forgot-password", { email }, { suppressSessionExpired: true }),
  confirmPasswordReset: (input: { token: string; new_password: string; confirm_password: string }) =>
    api.post<Record<string, never>>("/auth/reset-password", input, { suppressSessionExpired: true }),
};
