import type { CurrentUser, PermissionKey } from "@/types/auth";

export const isSuperAdmin = (user: CurrentUser | null) =>
  Boolean(user?.is_super_admin || user?.roles?.includes("super_admin"));

export const hasPermission = (user: CurrentUser | null, permission?: PermissionKey) => {
  if (!permission) return true;
  if (isSuperAdmin(user)) return true;
  return Boolean(user?.permissions?.includes(permission));
};

export const hasAnyPermission = (user: CurrentUser | null, permissions?: PermissionKey[]) => {
  if (!permissions || permissions.length === 0) return true;
  if (isSuperAdmin(user)) return true;
  return permissions.some((permission) => user?.permissions?.includes(permission));
};

export const hasAllPermissions = (user: CurrentUser | null, permissions?: PermissionKey[]) => {
  if (!permissions || permissions.length === 0) return true;
  if (isSuperAdmin(user)) return true;
  return permissions.every((permission) => user?.permissions?.includes(permission));
};
