import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { FullPagePermissionDenied } from "@/components/feedback/PermissionDenied";
import { LoadingState } from "@/components/data/LoadingState";
import { useAuth } from "@/features/auth/auth.store";
import { adminDashboardPermissions, getDefaultLandingPath } from "@/lib/default-landing";
import { hasFeature } from "@/lib/features";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";

export const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState rows={8} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export const PublicRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingState rows={5} />;
  }

  if (isAuthenticated) {
    return <Navigate to={getDefaultLandingPath(user)} replace />;
  }

  return <Outlet />;
};

export const PermissionGuard = ({ permission, children }: { permission?: string; children: ReactNode }) => {
  const { user } = useAuth();
  if (!hasPermission(user, permission)) return <FullPagePermissionDenied />;
  return <>{children}</>;
};

export const FeatureGuard = ({ feature, children }: { feature?: string; children: ReactNode }) => {
  const { user } = useAuth();
  if (!hasFeature(user, feature)) return <FullPagePermissionDenied />;
  return <>{children}</>;
};

export const ModuleRoute = ({
  requiredPermission,
  requiredPermissionsAny,
  requiredFeature,
  requiresLinkedEmployee,
  children,
}: {
  requiredPermission?: string;
  requiredPermissionsAny?: string[];
  requiredFeature?: string;
  requiresLinkedEmployee?: boolean;
  children: ReactNode;
}) => {
  const { user } = useAuth();

  if (requiresLinkedEmployee && !user?.employee_id) {
    if (hasAnyPermission(user, adminDashboardPermissions)) return <Navigate to="/dashboard" replace />;
    return <FullPagePermissionDenied />;
  }
  if (!hasFeature(user, requiredFeature)) return <FullPagePermissionDenied />;
  if (!hasPermission(user, requiredPermission)) return <FullPagePermissionDenied />;
  if (!hasAnyPermission(user, requiredPermissionsAny)) return <FullPagePermissionDenied />;

  return <>{children}</>;
};
