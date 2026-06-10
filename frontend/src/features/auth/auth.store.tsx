import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearAuthToken } from "@/lib/auth-token";
import { hasAllPermissions as userHasAllPermissions, hasAnyPermission as userHasAnyPermission, hasPermission as userHasPermission } from "@/lib/permissions";
import { hasFeature as userHasFeature } from "@/lib/features";
import { ApiError } from "@/lib/api-errors";
import type { AuthStateSnapshot, CurrentUser } from "@/types/auth";

import { authApi } from "./api";
import type { LoginInput } from "./auth.types";

interface AuthContextValue extends AuthStateSnapshot {
  refreshMe: () => Promise<void>;
  login: (input: LoginInput) => Promise<{ requires2FA: boolean }>;
  verifyLoginTwoFactor: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  setRequires2FA: (value: boolean) => void;
  hasPendingTwoFactorLogin: boolean;
  clearPendingTwoFactorLogin: () => void;
  hasPermission: (permission?: string) => boolean;
  hasAnyPermission: (permissions?: string[]) => boolean;
  hasAllPermissions: (permissions?: string[]) => boolean;
  hasFeature: (feature?: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const normalizeUser = (
  user: CurrentUser,
  options: { roles?: string[]; permissions?: string[]; outletIds?: string[]; features?: string[] } = {},
): CurrentUser => ({
  ...user,
  roles: options.roles ?? user.roles ?? [],
  permissions: options.permissions ?? user.permissions ?? [],
  outlet_ids: options.outletIds ?? user.outlet_ids ?? [],
  features: options.features ?? user.features ?? [],
  is_super_admin: user.is_super_admin ?? options.roles?.includes("super_admin") ?? false,
  is_admin: user.is_admin ?? options.roles?.some((role) => role === "admin" || role === "super_admin") ?? false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingTwoFactorLogin, setPendingTwoFactorLogin] = useState<(LoginInput & { challenge_id?: string }) | null>(null);

  const applyUser = useCallback(
    (nextUser: CurrentUser | null, options: { roles?: string[]; permissions?: string[]; outletIds?: string[]; features?: string[] } = {}) => {
      setUser(nextUser ? normalizeUser(nextUser, options) : null);
    },
    [],
  );

  const refreshMe = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await authApi.me();
      applyUser(response.data.user, {
        roles: response.data.roles,
        permissions: response.data.permissions,
        outletIds: response.data.outlet_ids,
        features: response.data.features,
      });
    } catch {
      applyUser(null);
      clearAuthToken();
    } finally {
      setIsLoading(false);
      setHasHydrated(true);
    }
  }, [applyUser]);

  useEffect(() => {
    void refreshMe();

    const onSessionExpired = () => {
      applyUser(null);
      clearAuthToken();
      setPendingTwoFactorLogin(null);
      setRequires2FA(false);
    };

    window.addEventListener("hrm:session-expired", onSessionExpired);
    return () => window.removeEventListener("hrm:session-expired", onSessionExpired);
  }, [applyUser, refreshMe]);

  const login = useCallback(
    async (input: LoginInput) => {
      let response;
      try {
        response = await authApi.login(input);
        if (response.data.two_factor_required) {
          setPendingTwoFactorLogin({ identifier: input.identifier, password: input.password, challenge_id: response.data.challenge_id });
          setRequires2FA(true);
          return { requires2FA: true };
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "TWO_FACTOR_REQUIRED") {
          const details = error.details as { challenge_id?: string } | undefined;
          setPendingTwoFactorLogin({ identifier: input.identifier, password: input.password, challenge_id: details?.challenge_id });
          setRequires2FA(true);
          return { requires2FA: true };
        }
        throw error;
      }

      setPendingTwoFactorLogin(null);
      clearAuthToken();

      if (response.data.user) {
        applyUser(response.data.user);
      }
      await refreshMe();

      setRequires2FA(false);
      return { requires2FA: false };
    },
    [applyUser, refreshMe],
  );

  const verifyLoginTwoFactor = useCallback(
    async (code: string) => {
      if (!pendingTwoFactorLogin) {
        throw new Error("Please log in again to continue.");
      }

      const response = pendingTwoFactorLogin.challenge_id
        ? await authApi.verifyLoginTwoFactor({ challenge_id: pendingTwoFactorLogin.challenge_id, code })
        : await authApi.login({
            ...pendingTwoFactorLogin,
            totp_code: code,
          });

      clearAuthToken();

      if (response.data.user) {
        applyUser(response.data.user);
      }
      await refreshMe();

      setPendingTwoFactorLogin(null);
      setRequires2FA(false);
    },
    [applyUser, pendingTwoFactorLogin, refreshMe],
  );

  const clearPendingTwoFactorLogin = useCallback(() => {
    setPendingTwoFactorLogin(null);
    setRequires2FA(false);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    clearAuthToken();
    applyUser(null);
    setPendingTwoFactorLogin(null);
    setRequires2FA(false);
  }, [applyUser]);

  const permissions = user?.permissions ?? [];
  const features = user?.features ?? [];
  const roles = user?.roles ?? [];
  const outletIds = user?.outlet_ids ?? [];
  const isSuperAdmin = Boolean(user?.is_super_admin || roles.includes("super_admin"));
  const isAdmin = Boolean(user?.is_admin || roles.some((role) => role === "admin" || role === "super_admin"));

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      permissions,
      features,
      roles,
      outletIds,
      token: null,
      isAuthenticated: Boolean(user),
      isLoading,
      hasHydrated,
      isSuperAdmin,
      isAdmin,
      requires2FA,
      refreshMe,
      login,
      verifyLoginTwoFactor,
      logout,
      setRequires2FA,
      hasPendingTwoFactorLogin: Boolean(pendingTwoFactorLogin),
      clearPendingTwoFactorLogin,
      hasPermission: (permission?: string) => userHasPermission(user, permission),
      hasAnyPermission: (nextPermissions?: string[]) => userHasAnyPermission(user, nextPermissions),
      hasAllPermissions: (nextPermissions?: string[]) => userHasAllPermissions(user, nextPermissions),
      hasFeature: (feature?: string) => userHasFeature(user, feature),
    };
  }, [clearPendingTwoFactorLogin, features, hasHydrated, isAdmin, isLoading, isSuperAdmin, login, logout, outletIds, pendingTwoFactorLogin, permissions, refreshMe, requires2FA, roles, user, verifyLoginTwoFactor]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
