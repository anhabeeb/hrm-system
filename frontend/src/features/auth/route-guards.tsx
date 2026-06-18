import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { LinkedEmployeeOnlyGuard, ModuleDisabledPage } from "@/components/access";
import { FullPagePermissionDenied } from "@/components/feedback/PermissionDenied";
import { LoadingState } from "@/components/data/LoadingState";
import { useAuth } from "@/features/auth/auth.store";
import { getDefaultLandingPath } from "@/lib/default-landing";
import { areModulesEnabled, isModuleEnabled } from "@/lib/features";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { hasAllAttendanceSubFeatures, hasAllPayrollSubFeatures, hasAttendanceSubFeature, hasPayrollSubFeature, type AttendanceSubFeatureKey, type PayrollSubFeatureKey } from "@/lib/subfeatures";

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
  if (!isModuleEnabled(user, feature)) return <ModuleDisabledPage />;
  return <>{children}</>;
};

export const ModuleRoute = ({
  requiredPermission,
  requiredPermissionsAny,
  requiredFeature,
  requiredFeaturesAll,
  moduleCode,
  moduleCodesAll,
  moduleName,
  requiredPayrollSubFeature,
  requiredPayrollSubFeaturesAll,
  requiredAttendanceSubFeature,
  requiredAttendanceSubFeaturesAll,
  requiresLinkedEmployee,
  children,
}: {
  requiredPermission?: string;
  requiredPermissionsAny?: string[];
  requiredFeature?: string;
  requiredFeaturesAll?: string[];
  moduleCode?: string;
  moduleCodesAll?: string[];
  moduleName?: string;
  requiredPayrollSubFeature?: PayrollSubFeatureKey;
  requiredPayrollSubFeaturesAll?: PayrollSubFeatureKey[];
  requiredAttendanceSubFeature?: AttendanceSubFeatureKey;
  requiredAttendanceSubFeaturesAll?: AttendanceSubFeatureKey[];
  requiresLinkedEmployee?: boolean;
  children: ReactNode;
}) => {
  const { user } = useAuth();

  if (requiresLinkedEmployee && !user?.employee_id) {
    return <LinkedEmployeeOnlyGuard>{children}</LinkedEmployeeOnlyGuard>;
  }
  if (!isModuleEnabled(user, moduleCode ?? requiredFeature)) return <ModuleDisabledPage moduleName={moduleName} />;
  if (!areModulesEnabled(user, moduleCodesAll ?? requiredFeaturesAll)) return <ModuleDisabledPage moduleName={moduleName} />;
  if (!hasPayrollSubFeature(user, requiredPayrollSubFeature) || !hasAllPayrollSubFeatures(user, requiredPayrollSubFeaturesAll)) return <ModuleDisabledPage moduleName={moduleName} />;
  if (!hasAttendanceSubFeature(user, requiredAttendanceSubFeature) || !hasAllAttendanceSubFeatures(user, requiredAttendanceSubFeaturesAll)) return <ModuleDisabledPage moduleName={moduleName} />;
  if (!hasPermission(user, requiredPermission)) return <FullPagePermissionDenied />;
  if (!hasAnyPermission(user, requiredPermissionsAny)) return <FullPagePermissionDenied />;

  return <>{children}</>;
};
