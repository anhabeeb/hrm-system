import type { LucideIcon } from "lucide-react";

import type { FeatureKey, PermissionKey } from "./auth";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  requiredFeature?: FeatureKey;
  children?: NavItem[];
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
