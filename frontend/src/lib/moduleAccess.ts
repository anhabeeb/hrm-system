import type { CurrentUser, FeatureKey, PermissionKey } from "@/types/auth";

import { areModulesEnabled, hasFeature, isModuleEnabled } from "./features";
import { hasAnyPermission, hasPermission } from "./permissions";

export interface ModuleAccessOptions {
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  moduleCode?: FeatureKey;
  requiredFeature?: FeatureKey;
  moduleCodesAll?: FeatureKey[];
  requiredFeaturesAll?: FeatureKey[];
  requiresLinkedEmployee?: boolean;
  accountType?: "employee" | "admin" | "any";
}

export const hasRequiredPermission = (
  user: CurrentUser | null,
  permission?: PermissionKey,
  permissionsAny?: PermissionKey[],
) => hasPermission(user, permission) && hasAnyPermission(user, permissionsAny);

export const requiresLinkedEmployee = (options?: Pick<ModuleAccessOptions, "requiresLinkedEmployee">) =>
  Boolean(options?.requiresLinkedEmployee);

export const canAccessSelfService = (user: CurrentUser | null) => Boolean(user?.employee_id);

const accountTypeAllowed = (user: CurrentUser | null, accountType: ModuleAccessOptions["accountType"] = "any") => {
  if (accountType === "employee") return Boolean(user?.employee_id);
  if (accountType === "admin") return Boolean(user?.is_admin || user?.is_super_admin);
  return true;
};

const areRequiredFeaturesEnabled = (user: CurrentUser | null, features?: FeatureKey[]) =>
  !features || features.length === 0 || features.every((feature) => hasFeature(user, feature));

export const isRouteFeatureAllowed = (
  user: CurrentUser | null,
  options: Pick<ModuleAccessOptions, "moduleCode" | "requiredFeature" | "moduleCodesAll" | "requiredFeaturesAll"> = {},
) =>
  isModuleEnabled(user, options.moduleCode) &&
  hasFeature(user, options.requiredFeature) &&
  areModulesEnabled(user, options.moduleCodesAll) &&
  areRequiredFeaturesEnabled(user, options.requiredFeaturesAll);

export const canShowModuleItem = (
  user: CurrentUser | null,
  moduleCode?: FeatureKey,
  permission?: PermissionKey,
  options: ModuleAccessOptions = {},
) =>
  isRouteFeatureAllowed(user, { ...options, moduleCode: moduleCode ?? options.moduleCode }) &&
  hasRequiredPermission(user, permission ?? options.requiredPermission, options.requiredPermissionsAny) &&
  (!requiresLinkedEmployee(options) || canAccessSelfService(user)) &&
  accountTypeAllowed(user, options.accountType);

export const canAccessModuleRoute = (
  user: CurrentUser | null,
  moduleCode?: FeatureKey,
  permission?: PermissionKey,
  options: ModuleAccessOptions = {},
) => canShowModuleItem(user, moduleCode, permission, options);
