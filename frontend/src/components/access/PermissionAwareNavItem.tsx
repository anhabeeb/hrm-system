import type { ReactNode } from "react";

import { canShowModuleItem, type ModuleAccessOptions } from "@/lib/moduleAccess";
import type { CurrentUser, PermissionKey } from "@/types/auth";

export const canRenderPermissionAwareNavItem = (
  user: CurrentUser | null,
  moduleCode?: string,
  requiredPermission?: PermissionKey,
  options: ModuleAccessOptions = {},
) => canShowModuleItem(user, moduleCode, requiredPermission, options);

export const PermissionAwareNavItem = ({
  user,
  moduleCode,
  requiredPermission,
  options,
  children,
}: {
  user: CurrentUser | null;
  moduleCode?: string;
  requiredPermission?: PermissionKey;
  options?: ModuleAccessOptions;
  children: ReactNode;
}) => {
  if (!canRenderPermissionAwareNavItem(user, moduleCode, requiredPermission, options)) return null;
  return <>{children}</>;
};
