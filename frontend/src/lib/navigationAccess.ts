import type { CurrentUser } from "@/types/auth";
import type { NavGroup, NavItem } from "@/types/navigation";

import { canShowModuleItem } from "./moduleAccess";

export const canAccessNavItem = (user: CurrentUser | null, item: NavItem) => {
  if (item.hidden) return false;
  if (item.adminOnly && !user?.is_admin && !user?.is_super_admin) return false;
  if (item.selfServiceOnly && !user?.employee_id) return false;
  return canShowModuleItem(user, item.moduleCode ?? item.requiredFeature, item.requiredPermission, {
    requiredPermissionsAny: item.requiredPermissionsAny,
    moduleCodesAll: item.moduleCodesAll,
    requiredFeaturesAll: item.requiredFeaturesAll,
    requiresLinkedEmployee: item.requiresLinkedEmployee,
    accountType: item.accountType,
  });
};

export const getVisibleNavigation = (groups: NavGroup[], user: CurrentUser | null): NavGroup[] =>
  groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessNavItem(user, item)),
    }))
    .filter((group) => group.items.length > 0);

export const searchNavigation = (groups: NavGroup[], query: string): NavGroup[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, item.path, group.label, item.id].some((value) => String(value ?? "").toLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.items.length > 0);
};

export const isNavigationItemMatch = (item: NavItem, pathname: string) => {
  if (item.exactMatch) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
};

export const flattenNavigationItems = (groups: NavGroup[]): NavItem[] =>
  groups.flatMap((group) => group.items);

export const getActiveNavigationItem = (groups: NavGroup[], pathname: string): NavItem | null =>
  flattenNavigationItems(groups)
    .filter((item) => isNavigationItemMatch(item, pathname))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null;

export const isNavigationItemActive = (item: NavItem, pathname: string, activePath?: string | null) => {
  if (activePath) return item.path === activePath;
  return isNavigationItemMatch(item, pathname);
};
