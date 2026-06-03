import type { RoleDetail, RoleListFilters, RoleListResult, RoleRecord, SafeRole } from "./roles.types";
import * as rolesRepository from "./roles.repository";
import type { AuthActor } from "../../types/api.types";
import { AppError } from "../../utils/errors";

const toSafeRole = (role: RoleRecord): SafeRole => ({
  id: role.id,
  role_key: role.role_key,
  role_name: role.role_name,
  name: role.role_name,
  description: role.description,
  is_system_role: role.is_system_role === 1,
  is_active: role.is_active === 1,
  users_count: role.users_count ?? 0,
  created_at: role.created_at,
  updated_at: role.updated_at,
});

export const listRoles = async (env: Env, context: AuthActor, filters: RoleListFilters): Promise<RoleListResult> => {
  const [total, rows] = await Promise.all([
    rolesRepository.countRoles(env, context.companyId, filters),
    rolesRepository.listRoles(env, context.companyId, filters),
  ]);
  return {
    rows: rows.map(toSafeRole),
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
};

export const getRole = async (env: Env, context: AuthActor, id: string): Promise<RoleDetail> => {
  const role = await rolesRepository.findRoleById(env, context.companyId, id);
  if (!role) {
    throw new AppError({
      code: "ROLE_NOT_FOUND",
      message: "The requested role could not be found.",
      statusCode: 404,
      retryable: false,
      step: "load_role",
    });
  }
  return {
    ...toSafeRole(role),
    permissions: await rolesRepository.getRolePermissions(env, context.companyId, id),
  };
};
