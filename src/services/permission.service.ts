import {
  ADMIN_ROLE_KEY,
  SUPER_ADMIN_ROLE_KEY,
} from "../modules/permissions/permissions.constants";
import * as permissionsRepository from "../modules/permissions/permissions.repository";
import type { PermissionContext } from "../modules/permissions/permissions.types";
import { NotFoundError, OutletAccessError } from "../utils/errors";

export const getUserRoles = permissionsRepository.getUserRoles;
export const getRolePermissions = permissionsRepository.getRolePermissions;
export const getUserPermissionOverrides =
  permissionsRepository.getUserPermissionOverrides;
export const getUserOutletIds = permissionsRepository.getUserOutletIds;

export const getEffectivePermissions = async (
  env: Env,
  companyId: string,
  userId: string,
): Promise<{
  roles: Awaited<ReturnType<typeof getUserRoles>>;
  permissions: string[];
  outletIds: string[];
}> => {
  const roles = await getUserRoles(env, companyId, userId);
  const rolePermissions = await getRolePermissions(
    env,
    companyId,
    roles.map((role) => role.id),
  );
  const overrides = await getUserPermissionOverrides(env, companyId, userId);
  const permissions = new Set(rolePermissions);

  for (const override of overrides) {
    if (override.is_allowed === 1) {
      permissions.add(override.permission_key);
    } else {
      permissions.delete(override.permission_key);
    }
  }

  return {
    roles,
    permissions: [...permissions],
    outletIds: await getUserOutletIds(env, companyId, userId),
  };
};

export const isSuperAdmin = (context: PermissionContext): boolean =>
  context.roleKeys.includes(SUPER_ADMIN_ROLE_KEY);

export const isAdminOrSuperAdmin = (context: PermissionContext): boolean =>
  isSuperAdmin(context) || context.roleKeys.includes(ADMIN_ROLE_KEY);

export const hasPermission = (
  context: PermissionContext,
  permissionKey: string,
): boolean => isSuperAdmin(context) || context.permissions.includes(permissionKey);

export const hasAnyPermission = (
  context: PermissionContext,
  permissionKeys: string[],
): boolean =>
  isSuperAdmin(context) ||
  permissionKeys.some((permissionKey) => context.permissions.includes(permissionKey));

export const hasAllPermissions = (
  context: PermissionContext,
  permissionKeys: string[],
): boolean =>
  isSuperAdmin(context) ||
  permissionKeys.every((permissionKey) => context.permissions.includes(permissionKey));

export const hasOutletAccess = (
  context: PermissionContext,
  outletId: string | null | undefined,
): boolean => {
  if (!outletId || isSuperAdmin(context)) {
    return true;
  }

  return context.outletIds.includes(outletId);
};

export const canAccessEmployee = async (
  env: Env,
  context: PermissionContext,
  employeeId: string,
): Promise<boolean> => {
  const employee = await permissionsRepository.findEmployeeOutlet(
    env,
    context.companyId,
    employeeId,
  );

  if (!employee) {
    throw new NotFoundError("The requested employee could not be found.");
  }

  if (!hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError();
  }

  return true;
};
