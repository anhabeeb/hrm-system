import { useMemo } from "react";

import { useAuth } from "@/features/auth/auth.store";
import {
  canAccessModuleRoute,
  canAccessSelfService,
  canShowModuleItem,
  hasRequiredPermission,
  type ModuleAccessOptions,
} from "@/lib/moduleAccess";
import { areModulesEnabled, isModuleEnabled } from "@/lib/features";
import type { PermissionKey } from "@/types/auth";

export const useModuleAccess = (moduleCode?: string, permission?: PermissionKey, options: ModuleAccessOptions = {}) => {
  const { user } = useAuth();

  return useMemo(
    () => ({
      enabled: isModuleEnabled(user, moduleCode),
      allEnabled: areModulesEnabled(user, options.moduleCodesAll ?? options.requiredFeaturesAll),
      hasPermission: hasRequiredPermission(user, permission ?? options.requiredPermission, options.requiredPermissionsAny),
      linkedEmployeeAvailable: canAccessSelfService(user),
      canShow: canShowModuleItem(user, moduleCode, permission, options),
      canAccessRoute: canAccessModuleRoute(user, moduleCode, permission, options),
      canAccessSelfService: canAccessSelfService(user),
    }),
    [moduleCode, options, permission, user],
  );
};
