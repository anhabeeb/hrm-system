import { createMiddleware } from "hono/factory";

import { SESSION_COOKIE_NAME, SESSION_EXPIRED_MESSAGE } from "../modules/auth/auth.constants";
import * as authRepository from "../modules/auth/auth.repository";
import { ADMIN_ROLE_KEY, SUPER_ADMIN_ROLE_KEY } from "../modules/permissions/permissions.constants";
import { getEffectivePermissions } from "../services/permission.service";
import { createAuditLog } from "../services/audit.service";
import { getSessionSecuritySettings } from "../services/settings.service";
import type { AppContext } from "../types/api.types";
import { AuthError } from "../utils/errors";
import { hashToken } from "../utils/crypto";
import { parseCookie } from "../services/session.service";

const minutesToMs = (minutes: number) => minutes * 60 * 1000;

const isExpiredByMinutes = (baseIso: string | null | undefined, minutes: number, now: number) => {
  if (!baseIso) return false;
  const base = new Date(baseIso).getTime();
  return Number.isFinite(base) && base + minutesToMs(minutes) <= now;
};

const shouldTouchSession = (request: { method: string; header: (name: string) => string | undefined }) => {
  if (request.header("x-hrm-user-activity") === "1") return true;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  return request.header("x-hrm-background-request") !== "1";
};

const sessionExpired = async (
  env: Env,
  input: {
    session?: {
      id: string;
      company_id: string;
      user_id: string;
    } | null;
    reason?: string;
    requestId?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<never> => {
  if (input.session?.id) {
    await authRepository.revokeSession(env, input.session.id, input.reason ?? "session_expired").catch(() => undefined);
    await createAuditLog(env, {
      companyId: input.session.company_id,
      action: input.reason ?? "session_expired",
      module: "auth",
      entityType: "session",
      entityId: input.session.id,
      actorId: input.session.user_id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId,
    }).catch(() => undefined);
  }
  throw new AuthError(SESSION_EXPIRED_MESSAGE, "SESSION_EXPIRED");
};

export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const rawToken = parseCookie(c.req.header("cookie") ?? null, SESSION_COOKIE_NAME);

  if (!rawToken) {
    throw new AuthError(SESSION_EXPIRED_MESSAGE);
  }

  const tokenHash = await hashToken(rawToken, c.env.SESSION_SECRET);
  const session = await authRepository.findSessionByTokenHash(c.env, tokenHash);
  const now = Date.now();
  const expiryRequestContext = {
    requestId: c.get("requestId"),
    ipAddress:
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      null,
    userAgent: c.req.header("user-agent") ?? null,
  };

  if (!session) {
    return await sessionExpired(c.env);
  }

  if (session.revoked_at || new Date(session.expires_at).getTime() <= now) {
    return await sessionExpired(c.env, {
      session,
      reason: "session_expired",
      ...expiryRequestContext,
    });
  }

  const user = await authRepository.findUserById(c.env, session.user_id);

  if (!user || user.status !== "active" || user.deleted_at) {
    return await sessionExpired(c.env, {
      session,
      reason: "session_invalidated_user_inactive",
      ...expiryRequestContext,
    });
  }

  const sessionSettings = await getSessionSecuritySettings(c.env, user.company_id);
  // Remembered sessions use their backend-issued expires_at as the absolute cap.
  // Idle timeout still applies, so background polling cannot keep them alive forever.
  const absoluteExpired =
    session.remember_me !== 1 &&
    sessionSettings.session_timeout_minutes !== null &&
    isExpiredByMinutes(session.created_at, sessionSettings.session_timeout_minutes, now);
  const idleExpired =
    sessionSettings.idle_timeout_minutes !== null &&
    isExpiredByMinutes(session.last_seen_at ?? session.created_at, sessionSettings.idle_timeout_minutes, now);

  if (absoluteExpired || idleExpired) {
    return await sessionExpired(c.env, {
      session,
      reason: absoluteExpired ? "session_expired_absolute_timeout" : "session_expired_idle_timeout",
      ...expiryRequestContext,
    });
  }

  const permissionsPromise = getEffectivePermissions(c.env, user.company_id, user.id);
  const touchPromise = shouldTouchSession(c.req)
    ? authRepository.touchSession(c.env, session.id)
    : Promise.resolve();
  const [{ roles, permissions, outletIds }] = await Promise.all([permissionsPromise, touchPromise]);
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
