import type { CurrentUser, PermissionKey } from "@/types/auth";

import { areModulesEnabled, isModuleEnabled } from "./features";
import { hasAnyPermission, hasPermission } from "./permissions";

export interface ModuleAccessOptions {
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  moduleCodesAll?: string[];
  requiredFeaturesAll?: string[];
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

export const canShowModuleItem = (
  user: CurrentUser | null,
  moduleCode?: string,
  permission?: PermissionKey,
  options: ModuleAccessOptions = {},
) =>
  isModuleEnabled(user, moduleCode) &&
  areModulesEnabled(user, options.moduleCodesAll ?? options.requiredFeaturesAll) &&
  hasRequiredPermission(user, permission ?? options.requiredPermission, options.requiredPermissionsAny) &&
  (!requiresLinkedEmployee(options) || canAccessSelfService(user)) &&
  accountTypeAllowed(user, options.accountType);

export const canAccessModuleRoute = (
  user: CurrentUser | null,
  moduleCode?: string,
  permission?: PermissionKey,
  options: ModuleAccessOptions = {},
) => canShowModuleItem(user, moduleCode, permission, options);
