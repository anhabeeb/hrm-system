import type { Context } from "hono";

import * as authService from "../auth/auth.service";
import * as usersService from "./users.service";
import {
  validateUserCreateInput,
  validateUserListFilters,
  validateUserReasonInput,
  validateUserRoleAssignmentInput,
  validateUserUpdateInput,
} from "./users.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const requestContext = (c: Context<AppContext>) => ({
  requestId: c.get("requestId"),
  ipAddress:
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for") ??
    null,
  userAgent: c.req.header("user-agent") ?? null,
  deviceId: c.req.header("x-device-id") ?? null,
});

const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("User is required.");
  return value;
};

export const listUsers = async (c: Context<AppContext>) => {
  const result = await usersService.listUsers(
    c.env,
    actor(c),
    validateUserListFilters({
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      search: c.req.query("search"),
      status: c.req.query("status"),
      role_id: c.req.query("role_id"),
      outlet_id: c.req.query("outlet_id"),
    }),
  );
  return paginated(result.rows, result.pagination, "Users loaded successfully.", { requestId: c.get("requestId") });
};

export const getUser = async (c: Context<AppContext>) =>
  ok({ user: await usersService.getUser(c.env, actor(c), id(c)) }, "User loaded successfully.", { requestId: c.get("requestId") });

export const createUser = async (c: Context<AppContext>) =>
  created(
    await usersService.createUser(c.env, actor(c), validateUserCreateInput(await body(c))),
    "User created successfully.",
    { requestId: c.get("requestId") },
  );

export const updateUser = async (c: Context<AppContext>) =>
  ok(
    await usersService.updateUser(c.env, actor(c), id(c), validateUserUpdateInput(await body(c))),
    "User updated successfully.",
    { requestId: c.get("requestId") },
  );

export const enableUser = async (c: Context<AppContext>) =>
  ok(
    await usersService.setUserStatus(c.env, actor(c), id(c), "active", validateUserReasonInput(await body(c)).reason),
    "User enabled successfully.",
    { requestId: c.get("requestId") },
  );

export const disableUser = async (c: Context<AppContext>) =>
  ok(
    await usersService.setUserStatus(c.env, actor(c), id(c), "disabled", validateUserReasonInput(await body(c)).reason),
    "User disabled successfully.",
    { requestId: c.get("requestId") },
  );

export const resetPassword = async (c: Context<AppContext>) => {
  await usersService.requirePasswordReset(
    c.env,
    actor(c),
    id(c),
    validateUserReasonInput(await body(c)).reason,
    c.get("authSession")?.id,
  );
  return ok({}, "Password reset has been required for this user.", { requestId: c.get("requestId") });
};

export const assignRoles = async (c: Context<AppContext>) => {
  const input = validateUserRoleAssignmentInput(await body(c));
  return ok(
    await usersService.assignRoles(c.env, actor(c), id(c), input.role_ids, input.reason),
    "User roles updated successfully.",
    { requestId: c.get("requestId") },
  );
};

export const listUserSessions = async (c: Context<AppContext>) =>
  ok(
    { sessions: await authService.listUserSessionsForAdmin(c.env, actor(c), id(c)) },
    "User sessions loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const revokeUserSession = async (c: Context<AppContext>) => {
  const sessionId = c.req.param("sessionId");
  if (!sessionId) throw new ValidationError("Session is required.");
  const input = validateUserReasonInput(await body(c));

  return ok(
    (await authService.revokeUserSessionForAdmin(c.env, actor(c), id(c), sessionId, input.reason, requestContext(c))).response,
    "User session revoked successfully.",
    { requestId: c.get("requestId") },
  );
};

export const revokeAllUserSessions = async (c: Context<AppContext>) => {
  const input = validateUserReasonInput(await body(c));

  return ok(
    (await authService.revokeAllUserSessionsForAdmin(c.env, actor(c), id(c), input.reason, requestContext(c))).response,
    "User sessions revoked successfully.",
    { requestId: c.get("requestId") },
  );
};
