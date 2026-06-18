import type { LucideIcon } from "lucide-react";

import type { FeatureKey, PermissionKey } from "./auth";
import type { AttendanceSubFeatureKey, PayrollSubFeatureKey } from "@/lib/subfeatures";

export type NavigationBadgeKey = "approvals" | "attendanceCorrections" | "rosterChanges" | "documentExpiry";

export interface NavItem {
  id?: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group?: string;
  moduleCode?: FeatureKey;
  moduleCodesAll?: FeatureKey[];
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  requiredFeature?: FeatureKey;
  requiredFeaturesAll?: FeatureKey[];
  requiredPayrollSubFeature?: PayrollSubFeatureKey;
  requiredPayrollSubFeaturesAll?: PayrollSubFeatureKey[];
  requiredAttendanceSubFeature?: AttendanceSubFeatureKey;
  requiredAttendanceSubFeaturesAll?: AttendanceSubFeatureKey[];
  requiresLinkedEmployee?: boolean;
  accountType?: "employee" | "admin" | "any";
  adminOnly?: boolean;
  selfServiceOnly?: boolean;
  managerOnly?: boolean;
  children?: NavItem[];
  badge?: string;
  badgeKey?: NavigationBadgeKey;
  warningKey?: NavigationBadgeKey;
  exactMatch?: boolean;
  hidden?: boolean;
}

export interface NavGroup {
  id?: string;
  label: string;
  items: NavItem[];
}

export type NavigationBadges = Partial<Record<NavigationBadgeKey, number | string | null | undefined>>;
