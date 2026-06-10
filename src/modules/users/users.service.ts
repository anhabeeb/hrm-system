import type {
  SafeUser,
  UserCreateInput,
  UserListFilters,
  UserListResult,
  UserRecord,
  UserUpdateInput,
} from "./users.types";
import * as usersRepository from "./users.repository";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, ConflictError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const disablingStatuses = new Set(["inactive", "disabled"]);

const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  page_size: pageSize,
  total,
  total_pages: Math.ceil(total / pageSize),
});

const audit = async (
  env: Env,
  context: AuthActor,
  action: string,
  entityId: string,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string,
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "users",
    action,
    entityType: "user",
    entityId,
    actorId: context.actorUserId,
    oldValueJson: oldValue === undefined ? undefined : JSON.stringify(oldValue),
    newValueJson: newValue === undefined ? undefined : JSON.stringify(newValue),
    reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Users audit log skipped", { action, entityId, requestId: context.requestId, error });
  });
};

const attachAccess = async (env: Env, companyId: string, users: UserRecord[]): Promise<SafeUser[]> => {
  const ids = users.map((user) => user.id);
  const [roleRows, outletRows, employeeRows] = await Promise.all([
    usersRepository.getUserRoles(env, companyId, ids),
    usersRepository.getUserOutlets(env, companyId, ids),
    usersRepository.getUserEmployeeLinks(env, companyId, ids),
  ]);

  return users.map((user) => {
    const roles = roleRows.filter((row) => row.user_id === user.id);
    const outlets = outletRows.filter((row) => row.user_id === user.id);
    const linkedEmployee = employeeRows.find((row) => row.user_id === user.id);
    return {
      id: user.id,
      employee_id: user.employee_id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      employee_name: linkedEmployee?.employee_name ?? null,
      employee_code: linkedEmployee?.employee_code ?? null,
      status: user.status,
      roles: roles.map((row) => row.role_name),
      role_ids: roles.map((row) => row.role_id),
      outlet_ids: outlets.map((row) => row.outlet_id),
      two_factor_enabled: user.two_factor_enabled === 1,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  });
};

const ensureUser = async (env: Env, context: AuthActor, id: string) => {
  const user = await usersRepository.findUserById(env, context.companyId, id);
  if (!user) {
    throw new AppError({
      code: "USER_NOT_FOUND",
      message: "The requested user could not be found.",
      statusCode: 404,
      retryable: false,
      step: "load_user",
    });
  }
  return user;
};

const ensureUniqueEmail = async (env: Env, _companyId: string, email: string, currentUserId?: string) => {
  const existing = await usersRepository.findUserByEmailGlobally(env, email);
  if (existing && existing.id !== currentUserId) {
    throw new AppError({
      code: "DUPLICATE_USER_EMAIL",
      message: "A user with this email already exists.",
      statusCode: 409,
      retryable: false,
    });
  }
};

const ensureUniqueUsername = async (env: Env, _companyId: string, username: string | null | undefined, currentUserId?: string) => {
  if (!username) return;
  const existing = await usersRepository.findUserByUsernameGlobally(env, username);
  if (existing && existing.id !== currentUserId) {
    throw new AppError({
      code: "DUPLICATE_USERNAME",
      message: "A user with this username already exists.",
      statusCode: 409,
      retryable: false,
    });
  }
};

const ensureEmployeeLinkAvailable = async (
  env: Env,
  context: AuthActor,
  employeeId: string | null | undefined,
  currentUserId?: string,
) => {
  if (!employeeId) return null;
  const employee = await usersRepository.findEmployeeSummary(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at || employee.employment_status === "archived") {
    throw new AppError({
      code: "EMPLOYEE_NOT_FOUND",
      message: "The selected employee could not be found.",
      statusCode: 404,
      retryable: false,
    });
  }
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new AppError({
      code: "OUTLET_ACCESS_DENIED",
      message: "You do not have access to this employee's outlet.",
      statusCode: 403,
      retryable: false,
    });
  }
  const linkedUser = await usersRepository.findUserByEmployeeId(env, context.companyId, employeeId);
  if (linkedUser && linkedUser.id !== currentUserId) {
    throw new AppError({
      code: "EMPLOYEE_ALREADY_HAS_LOGIN",
      message: "This employee already has a linked login account.",
      statusCode: 409,
      retryable: false,
    });
  }
  return employee;
};

const ensureRolesExist = async (env: Env, companyId: string, roleIds: string[]) => {
  const unique = [...new Set(roleIds)];
  const roles = await usersRepository.findRolesByIds(env, companyId, unique);
  if (roles.length !== unique.length) {
    throw new AppError({
      code: "ROLE_NOT_FOUND",
      message: "One or more selected roles could not be found.",
      statusCode: 404,
      retryable: false,
    });
  }
  return roles;
};

const ensureOutletsExist = async (env: Env, companyId: string, outletIds: string[]) => {
  const unique = [...new Set(outletIds)];
  const outlets = await usersRepository.findOutletsByIds(env, companyId, unique);
  if (outlets.length !== unique.length) {
    throw new AppError({
      code: "OUTLET_NOT_FOUND",
      message: "One or more selected outlets could not be found.",
      statusCode: 404,
      retryable: false,
    });
  }
  return unique;
};

const assertCanLoseSuperAdminAccess = async (
  env: Env,
  companyId: string,
  user: UserRecord,
  nextRoleIds?: string[],
  nextStatus?: string,
) => {
  const currentRoles = await usersRepository.getUserRoles(env, companyId, [user.id]);
  const isSuperAdmin = currentRoles.some((role) => role.role_key === "super_admin");
  if (!isSuperAdmin) return;

  let losesSuperAdmin = false;
  if (nextRoleIds) {
    const nextRoles = await usersRepository.findRolesByIds(env, companyId, [...new Set(nextRoleIds)]);
    losesSuperAdmin = !nextRoles.some((role) => role.role_key === "super_admin");
  }
  if (nextStatus && disablingStatuses.has(nextStatus)) {
    losesSuperAdmin = true;
  }

  if (!losesSuperAdmin) return;
  const remaining = await usersRepository.countActiveSuperAdmins(env, companyId, user.id);
  if (remaining === 0) {
    throw new ConflictError("At least one active Super Admin must remain in this company.");
  }
};

export const listUsers = async (env: Env, context: AuthActor, filters: UserListFilters): Promise<UserListResult> => {
  const [total, records] = await Promise.all([
    usersRepository.countUsers(env, context.companyId, filters),
    usersRepository.listUsers(env, context.companyId, filters),
  ]);
  return {
    rows: await attachAccess(env, context.companyId, records),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getUser = async (env: Env, context: AuthActor, id: string) => {
  const user = await ensureUser(env, context, id);
  const [safe] = await attachAccess(env, context.companyId, [user]);
  return safe;
};

export const createUser = async (env: Env, context: AuthActor, input: UserCreateInput) => {
  await ensureUniqueEmail(env, context.companyId, input.email);
  await ensureUniqueUsername(env, context.companyId, input.username);
  await ensureEmployeeLinkAvailable(env, context, input.employee_id);
  const roleIds = [...new Set(input.role_ids)];
  const outletIds = await ensureOutletsExist(env, context.companyId, input.outlet_ids);
  await ensureRolesExist(env, context.companyId, roleIds);

  const id = createPrefixedId("user");
  await usersRepository.createUser(env, {
    id,
    companyId: context.companyId,
    fullName: input.full_name,
    username: input.username ?? null,
    email: input.email,
    employeeId: input.employee_id ?? null,
    status: input.status,
  });
  if (roleIds.length > 0) await usersRepository.replaceUserRoles(env, context.companyId, id, roleIds);
  if (outletIds.length > 0) await usersRepository.replaceUserOutlets(env, context.companyId, id, outletIds);
  const user = await getUser(env, context, id);
  await audit(env, context, "user_created", id, undefined, user);
  return { user };
};

export const updateUser = async (env: Env, context: AuthActor, id: string, input: UserUpdateInput) => {
  const existing = await ensureUser(env, context, id);
  const nextEmail = input.email ?? existing.email;
  const nextUsername = input.username !== undefined ? input.username : existing.username;
  const nextEmployeeId = input.employee_id !== undefined ? input.employee_id : existing.employee_id;
  const emailChanged = input.email !== undefined && input.email !== existing.email;
  if (nextEmail) await ensureUniqueEmail(env, context.companyId, nextEmail, id);
  await ensureUniqueUsername(env, context.companyId, nextUsername, id);
  await ensureEmployeeLinkAvailable(env, context, nextEmployeeId, id);
  if (input.status && disablingStatuses.has(input.status) && id === context.actorUserId) {
    throw new ConflictError("You cannot disable your own account.");
  }
  await assertCanLoseSuperAdminAccess(env, context.companyId, existing, input.role_ids, input.status);

  await usersRepository.updateUserIdentity(env, context.companyId, id, {
    full_name: input.full_name ?? existing.full_name,
    username: nextUsername ?? null,
    email: nextEmail,
    employee_id: nextEmployeeId ?? null,
    status: input.status ?? existing.status,
  });
  if (input.role_ids) {
    await ensureRolesExist(env, context.companyId, input.role_ids);
    await usersRepository.replaceUserRoles(env, context.companyId, id, [...new Set(input.role_ids)]);
  }
  if (input.outlet_ids) {
    const outletIds = await ensureOutletsExist(env, context.companyId, input.outlet_ids);
    await usersRepository.replaceUserOutlets(env, context.companyId, id, outletIds);
  }
  if (input.status && disablingStatuses.has(input.status)) {
    await usersRepository.revokeUserSessions(env, context.companyId, id);
  }
  if (emailChanged) {
    await usersRepository.revokeUserSessions(env, context.companyId, id);
    await audit(env, context, "user_email_updated", id, { email: existing.email }, { email: nextEmail });
  }
  const user = await getUser(env, context, id);
  await audit(env, context, "user_updated", id, existing, user);
  return { user };
};

export const setUserStatus = async (env: Env, context: AuthActor, id: string, status: "active" | "disabled", reason: string) => {
  const existing = await ensureUser(env, context, id);
  if (status === "disabled" && id === context.actorUserId) throw new ConflictError("You cannot disable your own account.");
  await assertCanLoseSuperAdminAccess(env, context.companyId, existing, undefined, status);
  await usersRepository.updateUser(env, context.companyId, id, {
    full_name: existing.full_name,
    email: existing.email,
    status,
  });
  if (status === "disabled") await usersRepository.revokeUserSessions(env, context.companyId, id);
  const user = await getUser(env, context, id);
  await audit(env, context, status === "active" ? "user_enabled" : "user_disabled", id, existing, user, reason);
  return { user };
};

export const requirePasswordReset = async (env: Env, context: AuthActor, id: string, reason: string, currentSessionId?: string) => {
  const existing = await ensureUser(env, context, id);
  await usersRepository.setPasswordResetRequired(env, context.companyId, id);
  await usersRepository.revokeUserSessions(env, context.companyId, id, id === context.actorUserId ? currentSessionId : undefined);
  await audit(env, context, "user_password_reset_required", id, existing, { password_reset_required: true }, reason);
};

export const assignRoles = async (env: Env, context: AuthActor, id: string, roleIds: string[], reason: string) => {
  const existing = await ensureUser(env, context, id);
  const uniqueRoleIds = [...new Set(roleIds)];
  await ensureRolesExist(env, context.companyId, uniqueRoleIds);
  await assertCanLoseSuperAdminAccess(env, context.companyId, existing, uniqueRoleIds);
  await usersRepository.replaceUserRoles(env, context.companyId, id, uniqueRoleIds);
  const user = await getUser(env, context, id);
  await audit(env, context, "user_roles_updated", id, existing, user, reason);
  return { user };
};
