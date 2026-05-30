import { createMiddleware } from "hono/factory";

import { SESSION_COOKIE_NAME, SESSION_EXPIRED_MESSAGE } from "../modules/auth/auth.constants";
import * as authRepository from "../modules/auth/auth.repository";
import { ADMIN_ROLE_KEY, SUPER_ADMIN_ROLE_KEY } from "../modules/permissions/permissions.constants";
import { getEffectivePermissions } from "../services/permission.service";
import type { AppContext } from "../types/api.types";
import { AuthError } from "../utils/errors";
import { hashToken } from "../utils/crypto";
import { parseCookie } from "../services/session.service";

export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const rawToken = parseCookie(c.req.header("cookie") ?? null, SESSION_COOKIE_NAME);

  if (!rawToken) {
    throw new AuthError(SESSION_EXPIRED_MESSAGE);
  }

  const tokenHash = await hashToken(rawToken, c.env.SESSION_SECRET);
  const session = await authRepository.findSessionByTokenHash(c.env, tokenHash);

  if (
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw new AuthError(SESSION_EXPIRED_MESSAGE);
  }

  const user = await authRepository.findUserById(c.env, session.user_id);

  if (!user || user.status !== "active" || user.deleted_at) {
    throw new AuthError(SESSION_EXPIRED_MESSAGE);
  }

  const [{ roles, permissions, outletIds }] = await Promise.all([
    getEffectivePermissions(c.env, user.company_id, user.id),
    authRepository.touchSession(c.env, session.id),
  ]);
  const roleKeys = roles.map((role) => role.role_key);

  c.set("authUser", {
    requestId: c.get("requestId"),
    companyId: user.company_id,
    actorUserId: user.id,
    fullName: user.full_name,
    email: user.email,
    roles: roles.map((role) => role.role_name),
    roleKeys,
    permissions,
    outletIds,
    isSuperAdmin: roleKeys.includes(SUPER_ADMIN_ROLE_KEY),
    isAdmin: roleKeys.includes(ADMIN_ROLE_KEY),
    ipAddress:
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  c.set("authSession", {
    id: session.id,
    tokenHash,
    expiresAt: session.expires_at,
  });

  await next();
});
