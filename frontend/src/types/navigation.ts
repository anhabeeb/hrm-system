import type { LucideIcon } from "lucide-react";

import type { FeatureKey, PermissionKey } from "./auth";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  moduleCode?: FeatureKey;
  moduleCodesAll?: FeatureKey[];
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  requiredFeature?: FeatureKey;
  requiredFeaturesAll?: FeatureKey[];
  requiresLinkedEmployee?: boolean;
  accountType?: "employee" | "admin" | "any";
  children?: NavItem[];
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
