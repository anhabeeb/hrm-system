import type { ReactNode } from "react";

import { useModuleAccess } from "@/hooks/useModuleAccess";

import { ModuleDisabledPage } from "./ModuleDisabledPage";

export const ModuleDisabledGuard = ({
  moduleCode,
  moduleName,
  children,
}: {
  moduleCode?: string;
  moduleName?: string;
  children: ReactNode;
}) => {
  const access = useModuleAccess(moduleCode);
  if (!access.enabled) return <ModuleDisabledPage moduleName={moduleName} />;
  return <>{children}</>;
};
