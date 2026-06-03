import { api } from "@/lib/api-client";

import type { LoginInput, LoginResult, MeResult } from "./auth.types";

export const authApi = {
  login: (input: LoginInput) => api.post<LoginResult>("/auth/login", input, { suppressSessionExpired: true }),
  logout: () => api.post<Record<string, never>>("/auth/logout"),
  me: () => api.get<MeResult>("/auth/me"),
  verifyAuthenticatedTwoFactor: (code: string) => api.post<Record<string, never>>("/auth/2fa/verify", { code }),
  requestPasswordReset: (email: string) => api.post<Record<string, unknown>>("/auth/forgot-password", { email }, { suppressSessionExpired: true }),
  confirmPasswordReset: (input: { token: string; new_password: string; confirm_password: string }) =>
    api.post<Record<string, never>>("/auth/reset-password", input, { suppressSessionExpired: true }),
};
